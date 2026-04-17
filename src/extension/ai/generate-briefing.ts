import * as vscode from "vscode";
import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { parseJsonResponse } from "../../core/utils.js";
import type { VscodeCredentialProvider } from "../credentials.js";
import type {
  BriefingContext,
  TicketBriefing,
  BriefingFile,
  BriefingLink,
  BriefingConfidence,
} from "../../core/types.js";

const MAX_DESCRIPTION_CHARS = 2500;
const MAX_SIMILAR_CHARS = 800;

const outputChannel = vscode.window.createOutputChannel("SpecPilot: Ticket Briefing");

function truncate(text: string, limit: number): string {
  if (!text || text.length <= limit) return text;
  return text.slice(0, limit) + "\n(truncated)";
}

function buildPrompt(ctx: BriefingContext, workspaceHints: string[]): string {
  const acBlock = ctx.acceptanceCriteria.length > 0
    ? ctx.acceptanceCriteria.map((a, i) => `  ${i + 1}. ${a}`).join("\n")
    : "  (none provided)";

  const similarBlock = ctx.similarStories.length > 0
    ? ctx.similarStories
        .map((s) => `- ${s.key}: ${s.summary}\n  ${truncate(s.description, MAX_SIMILAR_CHARS)}`)
        .join("\n")
    : "  (no similar resolved stories found)";

  const hintsBlock = workspaceHints.length > 0
    ? workspaceHints.slice(0, 40).map((p) => `  - ${p}`).join("\n")
    : "  (no workspace file hints available)";

  return `You are briefing a software engineer who is about to start a Jira ticket. Your job is to give them a concrete starting point — which files to open, what the acceptance criteria imply, and what patterns from similar resolved stories they should mimic.

Ticket: ${ctx.issueKey} [${ctx.issueType}]
Summary: ${ctx.issueSummary}
${ctx.epicKey ? `Epic: ${ctx.epicKey} — ${ctx.epicSummary ?? ""}` : ""}

Acceptance Criteria:
${acBlock}

Description:
${truncate(ctx.description, MAX_DESCRIPTION_CHARS)}

Similar Resolved Stories in Same Epic:
${similarBlock}

Workspace Files (a sample — use these as grounding; do not invent paths):
${hintsBlock}

Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "summary": "One plain-English sentence telling the engineer what this ticket is really about.",
  "filesToOpen": [
    { "path": "relative/path/to/file.ts", "line": 42, "reason": "Why this file matters for this ticket." }
  ],
  "starters": [
    "Short imperative steps: 'Start by...', 'Then...', 'Finally...'"
  ],
  "similarStories": [
    { "title": "PROJ-123 summary", "url": "PROJ-123", "why": "What this prior story teaches." }
  ],
  "implications": [
    "Non-obvious things the AC implies but does not say out loud."
  ],
  "confidence": "high | medium | low"
}

Rules:
- filesToOpen: 1-4 files, prefer files from the workspace hints. Omit "line" if unsure.
- starters: 2-4 short imperative bullets.
- similarStories: only include if a similar story is genuinely relevant. Use the Jira key as url.
- implications: only include real non-obvious AC implications. Empty array if none.
- confidence: "high" if multiple specific signals line up, "low" if you are guessing.
- Do not invent file paths that are not in the workspace hints.
- Keep all strings terse.`;
}

function validateResponse(parsed: unknown, issueKey: string): TicketBriefing | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    outputChannel.appendLine("Response is not a JSON object");
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.summary !== "string") {
    outputChannel.appendLine(`Invalid response shape: ${JSON.stringify(Object.keys(obj))}`);
    return null;
  }

  const filesToOpen: BriefingFile[] = Array.isArray(obj.filesToOpen)
    ? obj.filesToOpen
        .map((f: unknown): BriefingFile | null => {
          if (!f || typeof f !== "object") return null;
          const o = f as Record<string, unknown>;
          if (typeof o.path !== "string") return null;
          return {
            path: o.path,
            line: typeof o.line === "number" && o.line > 0 ? Math.floor(o.line) : undefined,
            reason: typeof o.reason === "string" ? o.reason : "",
          };
        })
        .filter((f): f is BriefingFile => f !== null)
    : [];

  const starters: string[] = Array.isArray(obj.starters)
    ? obj.starters.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const similarStories: BriefingLink[] = Array.isArray(obj.similarStories)
    ? obj.similarStories
        .map((s: unknown): BriefingLink | null => {
          if (!s || typeof s !== "object") return null;
          const o = s as Record<string, unknown>;
          if (typeof o.title !== "string" || typeof o.url !== "string") return null;
          return {
            title: o.title,
            url: o.url,
            why: typeof o.why === "string" ? o.why : "",
          };
        })
        .filter((s): s is BriefingLink => s !== null)
    : [];

  const implications: string[] = Array.isArray(obj.implications)
    ? obj.implications.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const confidence: BriefingConfidence =
    obj.confidence === "high" || obj.confidence === "low" ? obj.confidence : "medium";

  return {
    issueKey,
    summary: obj.summary,
    filesToOpen,
    starters,
    similarStories,
    implications,
    confidence,
  };
}

function tokenToAbortSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  } else {
    const disposable = token.onCancellationRequested(() => {
      controller.abort();
      disposable.dispose();
    });
    controller.signal.addEventListener("abort", () => disposable.dispose(), { once: true });
  }
  return controller.signal;
}

async function briefWithBedrock(
  prompt: string,
  issueKey: string,
  token: vscode.CancellationToken,
): Promise<TicketBriefing | null> {
  const config = vscode.workspace.getConfiguration("specPilot");
  const region = config.get<string>("ai.bedrockRegion") || process.env.AWS_REGION || "us-east-2";
  const profile = config.get<string>("ai.bedrockProfile") || process.env.AWS_PROFILE;
  const modelId = config.get<string>("ai.bedrockModelId") || "us.anthropic.claude-opus-4-6-v1";

  outputChannel.appendLine(`Bedrock: region=${region}, profile=${profile ? "(configured)" : "(default)"}, model=${modelId}`);

  const client = new BedrockRuntimeClient({
    region,
    ...(profile ? { credentials: fromIni({ profile }) } : {}),
  });

  const response = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{
        role: "user",
        content: [{ text: prompt }],
      }],
      inferenceConfig: { maxTokens: 2048 },
    }),
    { abortSignal: tokenToAbortSignal(token) },
  );

  const text = response.output?.message?.content?.[0]?.text;
  if (!text) {
    outputChannel.appendLine("Bedrock: empty response");
    return null;
  }

  try {
    const parsed = parseJsonResponse<unknown>(text);
    return validateResponse(parsed, issueKey);
  } catch (err) {
    outputChannel.appendLine(`Bedrock: parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function briefWithAnthropic(
  prompt: string,
  issueKey: string,
  token: vscode.CancellationToken,
  credProvider: VscodeCredentialProvider,
): Promise<TicketBriefing | null> {
  const apiKey = await credProvider.getAnthropicApiKey();
  if (!apiKey) {
    outputChannel.appendLine("Anthropic: no API key configured");
    return null;
  }

  const config = vscode.workspace.getConfiguration("specPilot");
  const modelId = config.get<string>("ai.anthropicModelId") || "claude-sonnet-4-5-20250929";

  outputChannel.appendLine(`Anthropic: model=${modelId}`);

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create(
    {
      model: modelId,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    },
    { signal: tokenToAbortSignal(token) },
  );

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock?.text;
  if (!text) {
    outputChannel.appendLine("Anthropic: empty response");
    return null;
  }

  try {
    const parsed = parseJsonResponse<unknown>(text);
    return validateResponse(parsed, issueKey);
  } catch (err) {
    outputChannel.appendLine(`Anthropic: parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function briefWithVscodeLm(
  prompt: string,
  issueKey: string,
  token: vscode.CancellationToken,
): Promise<TicketBriefing | null> {
  const models = await vscode.lm.selectChatModels();
  outputChannel.appendLine(`vscode.lm: ${models.length} model(s) available`);
  if (models.length === 0) return null;

  const model = models[0];
  outputChannel.appendLine(`vscode.lm: using ${model.id}`);

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  const response = await model.sendRequest(messages, {}, token);

  let text = "";
  for await (const chunk of response.text) {
    text += chunk;
  }

  try {
    const parsed = parseJsonResponse<unknown>(text);
    return validateResponse(parsed, issueKey);
  } catch (err) {
    outputChannel.appendLine(`vscode.lm: parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function generateBriefing(
  context: BriefingContext,
  workspaceHints: string[],
  token: vscode.CancellationToken,
  credProvider?: VscodeCredentialProvider,
): Promise<TicketBriefing | null> {
  const config = vscode.workspace.getConfiguration("specPilot");
  const provider = config.get<string>("ai.provider", "auto");
  const prompt = buildPrompt(context, workspaceHints);

  outputChannel.appendLine(`--- Briefing ${context.issueKey} (provider: ${provider}) ---`);

  try {
    if (provider === "bedrock") {
      return await briefWithBedrock(prompt, context.issueKey, token);
    }
    if (provider === "anthropic") {
      if (!credProvider) return null;
      return await briefWithAnthropic(prompt, context.issueKey, token, credProvider);
    }
    if (provider === "vscode-lm") {
      return await briefWithVscodeLm(prompt, context.issueKey, token);
    }

    // Auto: Bedrock → Anthropic → vscode.lm
    try {
      const result = await briefWithBedrock(prompt, context.issueKey, token);
      if (result) {
        outputChannel.appendLine("Briefing successful (Bedrock).");
        return result;
      }
    } catch (err) {
      outputChannel.appendLine(`Bedrock failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (credProvider) {
      try {
        const result = await briefWithAnthropic(prompt, context.issueKey, token, credProvider);
        if (result) {
          outputChannel.appendLine("Briefing successful (Anthropic).");
          return result;
        }
      } catch (err) {
        outputChannel.appendLine(`Anthropic failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const result = await briefWithVscodeLm(prompt, context.issueKey, token);
    if (result) {
      outputChannel.appendLine("Briefing successful (vscode.lm).");
      return result;
    }

    outputChannel.appendLine(
      "No AI provider returned results. Configure Bedrock, Anthropic API, or VS Code LM (Copilot).",
    );
    return null;
  } catch (err) {
    outputChannel.appendLine(`Briefing failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
