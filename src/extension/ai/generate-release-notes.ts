import * as vscode from "vscode";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { parseJsonResponse } from "../../core/utils.js";
import type { ReleaseNotesResult } from "../../core/types.js";

export interface ReleaseNotesIssue {
  key: string;
  summary: string;
  type: string;
}

export interface GenerateReleaseNotesContext {
  issues: ReleaseNotesIssue[];
  versionName: string;
}

const MAX_ISSUES = 200;
const MAX_SUMMARY_CHARS = 200;

const outputChannel = vscode.window.createOutputChannel("SpecPilot: Release Notes AI");

function buildPrompt(ctx: GenerateReleaseNotesContext): string {
  const issueLines = ctx.issues
    .slice(0, MAX_ISSUES)
    .map((i) => `- ${i.key} [${i.type}]: ${i.summary.slice(0, MAX_SUMMARY_CHARS)}`)
    .join("\n");

  return `You are a product release notes writer. Given a list of Jira issues included in a software release, produce customer-facing release notes.

Version: ${ctx.versionName}

Issues:
${issueLines}

RULES:
- Write vague, customer-facing descriptions. Do NOT expose internal implementation details.
- Do NOT include Jira issue keys in the customer-facing summary text.
- Group items by feature area (e.g., "Account Management", "Search", "Performance", "Bug Fixes").
- Each item must have a "key" field (the Jira key, for internal reference only) and a "summary" field (the customer-facing description).
- The top-level "summary" should be 1-2 sentences describing the release at a high level.
- Do NOT mention technical debt, refactoring, infrastructure, or internal tooling.
- Keep descriptions accessible to non-technical stakeholders.
- If an issue is a bug fix, describe what was fixed from the user's perspective.

Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "summary": "High-level release summary (1-2 sentences)",
  "categories": [
    {
      "name": "Category Name",
      "items": [
        { "key": "PROJ-123", "summary": "Customer-facing description of the change" }
      ]
    }
  ]
}`;
}

function validateResponse(parsed: unknown): ReleaseNotesResult | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    outputChannel.appendLine("Response is not a JSON object");
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.summary !== "string" || !Array.isArray(obj.categories)) {
    outputChannel.appendLine(`Invalid response shape: ${JSON.stringify(Object.keys(obj))}`);
    return null;
  }
  const categories = obj.categories
    .filter((c: unknown): c is Record<string, unknown> =>
      c !== null && typeof c === "object" && !Array.isArray(c) &&
      typeof (c as Record<string, unknown>).name === "string" &&
      Array.isArray((c as Record<string, unknown>).items)
    )
    .map((c) => ({
      name: c.name as string,
      items: (c.items as unknown[])
        .filter((item: unknown): item is Record<string, unknown> =>
          item !== null && typeof item === "object" &&
          typeof (item as Record<string, unknown>).key === "string" &&
          typeof (item as Record<string, unknown>).summary === "string"
        )
        .map((item) => ({
          key: item.key as string,
          summary: item.summary as string,
        })),
    }))
    .filter((c) => c.items.length > 0);

  if (categories.length === 0) {
    outputChannel.appendLine("Response has no valid categories");
    return null;
  }

  return { summary: obj.summary as string, categories };
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

async function generateWithBedrock(
  ctx: GenerateReleaseNotesContext,
  token: vscode.CancellationToken,
): Promise<ReleaseNotesResult | null> {
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
        content: [{ text: buildPrompt(ctx) }],
      }],
      inferenceConfig: {
        maxTokens: 4096,
      },
    }),
    { abortSignal: tokenToAbortSignal(token) },
  );

  const text = response.output?.message?.content?.[0]?.text;
  if (!text) {
    outputChannel.appendLine("Bedrock: empty response");
    return null;
  }

  outputChannel.appendLine(`Bedrock: response ${text.length} chars`);
  try {
    const parsed = parseJsonResponse<ReleaseNotesResult>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`Bedrock: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function generateWithVscodeLm(
  ctx: GenerateReleaseNotesContext,
  token: vscode.CancellationToken,
): Promise<ReleaseNotesResult | null> {
  const models = await vscode.lm.selectChatModels();
  outputChannel.appendLine(`vscode.lm: ${models.length} model(s) available`);

  if (models.length === 0) {
    return null;
  }

  const model = models[0];
  outputChannel.appendLine(`vscode.lm: using ${model.id}`);

  const messages = [
    vscode.LanguageModelChatMessage.User(buildPrompt(ctx)),
  ];

  const response = await model.sendRequest(messages, {}, token);

  let text = "";
  for await (const chunk of response.text) {
    text += chunk;
  }

  outputChannel.appendLine(`vscode.lm: response ${text.length} chars`);
  try {
    const parsed = parseJsonResponse<ReleaseNotesResult>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`vscode.lm: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function generateReleaseNotesWithAI(
  ctx: GenerateReleaseNotesContext,
  token: vscode.CancellationToken,
): Promise<ReleaseNotesResult | null> {
  const config = vscode.workspace.getConfiguration("specPilot");
  const provider = config.get<string>("ai.provider", "auto");

  outputChannel.appendLine(`--- Release notes generation started (provider: ${provider}, ${ctx.issues.length} issues) ---`);

  try {
    if (provider === "bedrock") {
      return await generateWithBedrock(ctx, token);
    }

    if (provider === "vscode-lm") {
      return await generateWithVscodeLm(ctx, token);
    }

    // Auto: try Bedrock first, fall back to vscode.lm
    try {
      const result = await generateWithBedrock(ctx, token);
      if (result) {
        outputChannel.appendLine("Generation successful (Bedrock).");
        return result;
      }
    } catch (err) {
      outputChannel.appendLine(`Bedrock failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const result = await generateWithVscodeLm(ctx, token);
    if (result) {
      outputChannel.appendLine("Generation successful (vscode.lm).");
      return result;
    }

    outputChannel.appendLine("No AI provider available.");
    return null;
  } catch (err) {
    outputChannel.appendLine(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
