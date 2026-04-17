import * as vscode from "vscode";
import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { parseJsonResponse } from "../../core/utils.js";
import { loadTemplate } from "./template-loader.js";
import type { VscodeCredentialProvider } from "../credentials.js";

export interface EnhanceIssueContext {
  issueType: "Bug" | "Story";
  projectKey: string;
  summary: string;
  description: string;
  selectedCode: string;
  filePath: string;
  lineRange: string;
  language: string;
}

export interface EnhancedIssue {
  summary: string;
  description: string;
  userStory?: string;
  why?: string;
  acceptanceCriteria: string[];
  releaseInstructions?: string;
}

const MAX_CODE_CHARS = 3000;

const outputChannel = vscode.window.createOutputChannel("SpecPilot: AI Enhancement");

function buildPrompt(ctx: EnhanceIssueContext): string {
  const codeTruncated = ctx.selectedCode.length > MAX_CODE_CHARS;
  const code = codeTruncated
    ? ctx.selectedCode.slice(0, MAX_CODE_CHARS)
    : ctx.selectedCode;
  const totalLines = ctx.selectedCode.split("\n").length;

  const codeBlock = `Code Context:
File: ${ctx.filePath} (${ctx.lineRange})
Language: ${ctx.language}
\`\`\`${ctx.language}
${code}
\`\`\`${codeTruncated ? `\n(truncated — full selection is ${totalLines} lines)` : ""}`;

  if (ctx.issueType === "Story") {
    const template = loadTemplate("story");

    return `You are a Jira ticket writer for a software engineering team. Given code context and a brief description, produce an enhanced Jira ticket following the BDD Story template below.

Issue Type: Story
Project: ${ctx.projectKey}

User's Summary: ${ctx.summary}
User's Description: ${ctx.description || "(none provided)"}

${codeBlock}

BDD Story Template:
${template}

Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "summary": "Short, focused user-facing title (under 80 characters)",
  "userStory": "As a <user/persona>, I want to <need> so that <value>.",
  "why": "Brief explanation of the business value, user value, or operational value.",
  "acceptanceCriteria": [
    "Given <starting state>, when <action>, then <expected result>.",
    "Given <starting state>, when <action>, then <expected result>."
  ],
  "releaseInstructions": "Notes on feature flags, rollout, or dependencies. Empty string if none.",
  "description": ""
}

Rules:
- Follow the BDD Story template structure exactly.
- Write the userStory in "As a... I want to... so that..." format.
- Write 3-5 acceptance criteria in BDD "Given/When/Then" format as testable statements.
- Keep the summary professional and actionable.
- Reference specific functions, components, or patterns visible in the code.
- Do not invent details not supported by the code context.
- The description field should be an empty string for stories (the structured fields cover it).`;
  }

  return `You are a Jira ticket writer for a software engineering team. Given code context and a brief description, produce an enhanced Jira bug ticket.

Issue Type: Bug
Project: ${ctx.projectKey}

User's Summary: ${ctx.summary}
User's Description: ${ctx.description || "(none provided)"}

${codeBlock}

Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "summary": "Clear, concise bug title (under 80 characters)",
  "description": "Detailed description: what the problem is, expected vs actual behavior, and steps to reproduce if inferable from the code. 2-4 paragraphs.",
  "acceptanceCriteria": []
}

Rules:
- Describe the problem, expected vs actual behavior, and steps to reproduce if inferable.
- Set acceptanceCriteria to an empty array [].
- Keep the summary professional and actionable.
- Reference specific functions, components, or patterns visible in the code.
- Do not invent details not supported by the code context.`;
}

function validateResponse(parsed: unknown): EnhancedIssue | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    outputChannel.appendLine("Response is not a JSON object");
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.summary !== "string" ||
    !Array.isArray(obj.acceptanceCriteria)
  ) {
    outputChannel.appendLine(`Invalid response shape: ${JSON.stringify(Object.keys(obj))}`);
    return null;
  }
  const acceptanceCriteria = obj.acceptanceCriteria.filter(
    (item: unknown): item is string => typeof item === "string"
  );
  return {
    summary: obj.summary as string,
    description: (typeof obj.description === "string" ? obj.description : ""),
    userStory: (typeof obj.userStory === "string" ? obj.userStory : undefined),
    why: (typeof obj.why === "string" ? obj.why : undefined),
    acceptanceCriteria,
    releaseInstructions: (typeof obj.releaseInstructions === "string" ? obj.releaseInstructions : undefined),
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
    // Clean up listener when the signal is aborted by other means
    controller.signal.addEventListener("abort", () => disposable.dispose(), { once: true });
  }
  return controller.signal;
}

async function enhanceWithBedrock(
  context: EnhanceIssueContext,
  token: vscode.CancellationToken,
): Promise<EnhancedIssue | null> {
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
        content: [{ text: buildPrompt(context) }],
      }],
      inferenceConfig: {
        maxTokens: 2048,
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
    const parsed = parseJsonResponse<EnhancedIssue>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`Bedrock: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function enhanceWithAnthropic(
  context: EnhanceIssueContext,
  token: vscode.CancellationToken,
  credProvider: VscodeCredentialProvider,
): Promise<EnhancedIssue | null> {
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
      messages: [{ role: "user", content: buildPrompt(context) }],
    },
    { signal: tokenToAbortSignal(token) },
  );

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock?.text;
  if (!text) {
    outputChannel.appendLine("Anthropic: empty response");
    return null;
  }

  outputChannel.appendLine(`Anthropic: response ${text.length} chars`);
  try {
    const parsed = parseJsonResponse<EnhancedIssue>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`Anthropic: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function enhanceWithVscodeLm(
  context: EnhanceIssueContext,
  token: vscode.CancellationToken,
): Promise<EnhancedIssue | null> {
  const models = await vscode.lm.selectChatModels();
  outputChannel.appendLine(`vscode.lm: ${models.length} model(s) available`);

  if (models.length === 0) {
    return null;
  }

  const model = models[0];
  outputChannel.appendLine(`vscode.lm: using ${model.id}`);

  const messages = [
    vscode.LanguageModelChatMessage.User(buildPrompt(context)),
  ];

  const response = await model.sendRequest(messages, {}, token);

  let text = "";
  for await (const chunk of response.text) {
    text += chunk;
  }

  outputChannel.appendLine(`vscode.lm: response ${text.length} chars`);
  try {
    const parsed = parseJsonResponse<EnhancedIssue>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`vscode.lm: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function enhanceIssueWithAI(
  context: EnhanceIssueContext,
  token: vscode.CancellationToken,
  credProvider?: VscodeCredentialProvider,
): Promise<EnhancedIssue | null> {
  const config = vscode.workspace.getConfiguration("specPilot");
  const provider = config.get<string>("ai.provider", "auto");

  outputChannel.appendLine(`--- Enhancement started (provider: ${provider}) ---`);

  try {
    if (provider === "bedrock") {
      return await enhanceWithBedrock(context, token);
    }

    if (provider === "anthropic") {
      if (!credProvider) return null;
      return await enhanceWithAnthropic(context, token, credProvider);
    }

    if (provider === "vscode-lm") {
      return await enhanceWithVscodeLm(context, token);
    }

    // Auto: try Bedrock -> Anthropic -> vscode.lm
    try {
      const result = await enhanceWithBedrock(context, token);
      if (result) {
        outputChannel.appendLine("Enhancement successful (Bedrock).");
        return result;
      }
    } catch (err) {
      outputChannel.appendLine(`Bedrock failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (credProvider) {
      try {
        const result = await enhanceWithAnthropic(context, token, credProvider);
        if (result) {
          outputChannel.appendLine("Enhancement successful (Anthropic).");
          return result;
        }
      } catch (err) {
        outputChannel.appendLine(`Anthropic failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const result = await enhanceWithVscodeLm(context, token);
    if (result) {
      outputChannel.appendLine("Enhancement successful (vscode.lm).");
      return result;
    }

    outputChannel.appendLine(
      "No AI provider returned results. Configure: Bedrock (AWS credentials), " +
      "Anthropic API (run 'SpecPilot: Set Anthropic API Key'), or VS Code LM (GitHub Copilot)."
    );
    return null;
  } catch (err) {
    outputChannel.appendLine(`Enhancement failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
