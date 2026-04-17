import * as vscode from "vscode";
import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { parseJsonResponse } from "../../core/utils.js";
import type { AiAnalysis } from "../../core/types.js";
import type { VscodeCredentialProvider } from "../credentials.js";

export interface ExistingEpicContext {
  key: string;
  summary: string;
  stories: { key: string; summary: string; description: string }[];
}

export interface GenerateAnalysisContext {
  statSummary: string;
  categories: Record<string, string[]>;
  routes: string[];
  existingEpics?: ExistingEpicContext[];
  focusArea?: string;
}

const MAX_STAT_CHARS = 30_000;
const MAX_FILES_PER_CATEGORY = 50;

const outputChannel = vscode.window.createOutputChannel("SpecPilot: Analysis AI");

function buildPrompt(ctx: GenerateAnalysisContext): string {
  const categoryLines = Object.entries(ctx.categories)
    .map(([cat, files]) => {
      const shown = files.slice(0, MAX_FILES_PER_CATEGORY);
      const lines = shown.map((f) => `- ${f}`).join("\n");
      const extra = files.length > MAX_FILES_PER_CATEGORY
        ? `\n- ...and ${files.length - MAX_FILES_PER_CATEGORY} more`
        : "";
      return `### ${cat} (${files.length} files)\n${lines}${extra}`;
    })
    .join("\n\n");

  const routeLines = ctx.routes.length > 0
    ? `\nDetected Routes:\n${ctx.routes.map((r) => `- ${r}`).join("\n")}`
    : "";

  let existingEpicsSection = "";
  if (ctx.existingEpics && ctx.existingEpics.length > 0) {
    const epicLines = ctx.existingEpics.map((e) => {
      const storyLines = e.stories.length > 0
        ? e.stories.map((s) => `    - ${s.key}: ${s.summary}`).join("\n")
        : "    (no stories yet)";
      return `  - ${e.key}: ${e.summary}\n${storyLines}`;
    }).join("\n");

    existingEpicsSection = `
## Existing Jira Epics & Stories (already created — DO NOT duplicate)
${epicLines}
`;
  }

  return `You are a senior software architect. Given a git diff summary comparing a prototype branch against production, produce a structured epic and story breakdown for Jira.

## Diff Summary (--stat)
\`\`\`
${ctx.statSummary.slice(0, MAX_STAT_CHARS)}
\`\`\`

## File Categories
${categoryLines}
${routeLines}
${existingEpicsSection}${ctx.focusArea ? `
## Focus Area (PRIORITY INSTRUCTION)
The user has specified the following focus area. Prioritize this above all else:
${ctx.focusArea}

Only generate epics and stories that are directly relevant to this focus area. Ignore file changes that are unrelated.
` : ""}
RULES:
- Group related changes into epics (feature areas).
- Each epic should have a clear title and description.
- Break each epic into stories that represent user-facing or developer-facing units of work.
- Each story needs: title, description, acceptanceCriteria (array of strings), sourceFiles (array of relevant file paths), screenshotRoutes (array of routes this story affects, empty if non-visual).
- Stories about API routes, feature flags, analytics, middleware, or backend logic should have empty screenshotRoutes.
- Use BDD-style acceptance criteria (Given/When/Then) where appropriate.
- Keep stories small enough to complete in 1-3 days.
- Include dependsOn (zero-based indices within the epic) where one story must be completed before another.
- The summary should be 1-2 sentences describing the overall scope of changes.
- List any new dependencies in newDependencies.
- Note any infrastructure changes in infrastructureNotes.
- CRITICAL: Do NOT generate epics or stories that overlap with the existing Jira epics and stories listed above. Only generate NEW work for features and changes not already covered. If a diff file is already covered by an existing story, skip it.

Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "summary": "High-level summary of all changes",
  "epics": [
    {
      "title": "Epic title",
      "description": "Epic description",
      "stories": [
        {
          "title": "Story title",
          "description": "Story description",
          "acceptanceCriteria": ["Given...", "When...", "Then..."],
          "sourceFiles": ["path/to/file.tsx"],
          "screenshotRoutes": ["/route"],
          "dependsOn": []
        }
      ]
    }
  ],
  "newDependencies": [],
  "infrastructureNotes": []
}`;
}

function validateResponse(parsed: unknown): AiAnalysis | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    outputChannel.appendLine("Response is not a JSON object");
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.epics)) {
    outputChannel.appendLine(`Invalid response shape: missing epics array`);
    return null;
  }

  const epics = obj.epics
    .filter((e: unknown): e is Record<string, unknown> =>
      e !== null && typeof e === "object" && !Array.isArray(e) &&
      typeof (e as Record<string, unknown>).title === "string" &&
      Array.isArray((e as Record<string, unknown>).stories)
    )
    .map((e) => ({
      title: e.title as string,
      description: typeof e.description === "string" ? e.description : "",
      stories: (e.stories as unknown[])
        .filter((s: unknown): s is Record<string, unknown> =>
          s !== null && typeof s === "object" &&
          typeof (s as Record<string, unknown>).title === "string"
        )
        .map((s) => ({
          title: s.title as string,
          description: typeof s.description === "string" ? s.description : "",
          acceptanceCriteria: Array.isArray(s.acceptanceCriteria)
            ? (s.acceptanceCriteria as unknown[]).filter((c): c is string => typeof c === "string")
            : [],
          sourceFiles: Array.isArray(s.sourceFiles)
            ? (s.sourceFiles as unknown[]).filter((f): f is string => typeof f === "string")
            : [],
          screenshotRoutes: Array.isArray(s.screenshotRoutes)
            ? (s.screenshotRoutes as unknown[]).filter((r): r is string => typeof r === "string")
            : [],
          dependsOn: Array.isArray(s.dependsOn)
            ? (s.dependsOn as unknown[]).filter((d): d is number => typeof d === "number")
            : [],
        })),
    }))
    .filter((e) => e.stories.length > 0);

  if (epics.length === 0) {
    outputChannel.appendLine("Response has no valid epics with stories");
    return null;
  }

  return {
    epics,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    newDependencies: Array.isArray(obj.newDependencies)
      ? (obj.newDependencies as unknown[]).filter((d): d is string => typeof d === "string")
      : [],
    infrastructureNotes: Array.isArray(obj.infrastructureNotes)
      ? (obj.infrastructureNotes as unknown[]).filter((n): n is string => typeof n === "string")
      : [],
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

async function generateWithBedrock(
  ctx: GenerateAnalysisContext,
  token: vscode.CancellationToken,
): Promise<AiAnalysis | null> {
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
    new ConverseStreamCommand({
      modelId,
      messages: [{
        role: "user",
        content: [{ text: buildPrompt(ctx) }],
      }],
      inferenceConfig: {
        maxTokens: 128000,
      },
      additionalModelRequestFields: {
        thinking: {
          type: "enabled",
          budget_tokens: 50000,
        },
      },
    }),
    { abortSignal: tokenToAbortSignal(token) },
  );

  // Collect streamed text chunks (skip reasoning blocks)
  let text = "";
  const stream = response.stream;
  if (stream) {
    for await (const event of stream) {
      if (event.contentBlockDelta) {
        const delta = event.contentBlockDelta.delta;
        if (delta && "text" in delta && typeof delta.text === "string") {
          text += delta.text;
        }
      }
    }
  }
  if (!text) {
    outputChannel.appendLine("Bedrock: empty response (no text in stream)");
    return null;
  }

  outputChannel.appendLine(`Bedrock: response ${text.length} chars`);
  try {
    const parsed = parseJsonResponse<AiAnalysis>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`Bedrock: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function generateWithAnthropic(
  ctx: GenerateAnalysisContext,
  token: vscode.CancellationToken,
  credProvider: VscodeCredentialProvider,
): Promise<AiAnalysis | null> {
  const apiKey = await credProvider.getAnthropicApiKey();
  if (!apiKey) {
    outputChannel.appendLine("Anthropic: no API key configured");
    return null;
  }

  const config = vscode.workspace.getConfiguration("specPilot");
  const modelId = config.get<string>("ai.anthropicModelId") || "claude-sonnet-4-5-20250929";

  outputChannel.appendLine(`Anthropic: model=${modelId} (extended thinking enabled)`);

  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream(
    {
      model: modelId,
      max_tokens: 128000,
      thinking: { type: "enabled", budget_tokens: 50000 },
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    },
    { signal: tokenToAbortSignal(token) },
  );

  let text = "";
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      text += event.delta.text;
    }
  }

  if (!text) {
    outputChannel.appendLine("Anthropic: empty response (no text in stream)");
    return null;
  }

  outputChannel.appendLine(`Anthropic: response ${text.length} chars`);
  try {
    const parsed = parseJsonResponse<AiAnalysis>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`Anthropic: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function generateWithVscodeLm(
  ctx: GenerateAnalysisContext,
  token: vscode.CancellationToken,
): Promise<AiAnalysis | null> {
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
    const parsed = parseJsonResponse<AiAnalysis>(text);
    return validateResponse(parsed);
  } catch (err) {
    outputChannel.appendLine(`vscode.lm: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function generateAnalysisWithAI(
  ctx: GenerateAnalysisContext,
  token: vscode.CancellationToken,
  credProvider?: VscodeCredentialProvider,
): Promise<AiAnalysis | null> {
  const config = vscode.workspace.getConfiguration("specPilot");
  const provider = config.get<string>("ai.provider", "auto");

  outputChannel.appendLine(`--- Analysis generation started (provider: ${provider}, ${Object.values(ctx.categories).flat().length} files) ---`);

  try {
    if (provider === "bedrock") {
      return await generateWithBedrock(ctx, token);
    }

    if (provider === "anthropic") {
      if (!credProvider) return null;
      return await generateWithAnthropic(ctx, token, credProvider);
    }

    if (provider === "vscode-lm") {
      return await generateWithVscodeLm(ctx, token);
    }

    // Auto: try Bedrock -> Anthropic -> vscode.lm
    try {
      const result = await generateWithBedrock(ctx, token);
      if (result) {
        outputChannel.appendLine("Generation successful (Bedrock).");
        return result;
      }
    } catch (err) {
      outputChannel.appendLine(`Bedrock failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (credProvider) {
      try {
        const result = await generateWithAnthropic(ctx, token, credProvider);
        if (result) {
          outputChannel.appendLine("Generation successful (Anthropic).");
          return result;
        }
      } catch (err) {
        outputChannel.appendLine(`Anthropic failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const result = await generateWithVscodeLm(ctx, token);
    if (result) {
      outputChannel.appendLine("Generation successful (vscode.lm).");
      return result;
    }

    outputChannel.appendLine(
      "No AI provider returned results. Configure: Bedrock (AWS credentials), " +
      "Anthropic API (run 'SpecPilot: Set Anthropic API Key'), or VS Code LM (GitHub Copilot)."
    );
    return null;
  } catch (err) {
    outputChannel.appendLine(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Epic Story Generation — break down a single existing epic into stories
// ---------------------------------------------------------------------------

export interface EpicStoryGenContext {
  epicKey: string;
  epicSummary: string;
  epicDescription: string;
  existingStories: { key: string; summary: string; description: string }[];
  focusArea?: string;
}

function buildEpicStoryPrompt(ctx: EpicStoryGenContext): string {
  let existingStoriesSection = "";
  if (ctx.existingStories.length > 0) {
    const storyLines = ctx.existingStories
      .map((s) => `- ${s.key}: ${s.summary}`)
      .join("\n");
    existingStoriesSection = `
## Existing Stories (already created — DO NOT duplicate)
${storyLines}
`;
  }

  return `You are a senior software architect. Given an existing Jira epic, break it down into implementable stories.

## Epic: ${ctx.epicKey}
**Summary:** ${ctx.epicSummary}

**Description:**
${ctx.epicDescription || "(no description)"}
${existingStoriesSection}${ctx.focusArea ? `
## Focus Area (PRIORITY INSTRUCTION)
${ctx.focusArea}
Only generate stories directly relevant to this focus area.
` : ""}
RULES:
- Generate stories that represent user-facing or developer-facing units of work for this epic.
- Each story needs: title, description, acceptanceCriteria (array of strings), sourceFiles (empty array), screenshotRoutes (array of routes if visual, empty if not).
- Use BDD-style acceptance criteria (Given/When/Then) where appropriate.
- Keep stories small enough to complete in 1-3 days.
- Include dependsOn (zero-based indices within this epic) where one story must be completed before another.
- Do NOT duplicate any existing stories listed above.
- Stories about API routes, feature flags, analytics, middleware, or backend logic should have empty screenshotRoutes.

Respond with ONLY a JSON object (no markdown fences, no explanation). Wrap the stories in a single epic:
{
  "summary": "Brief summary of the story breakdown",
  "epics": [
    {
      "title": "${ctx.epicSummary}",
      "description": "Use the existing epic description",
      "stories": [
        {
          "title": "Story title",
          "description": "Story description",
          "acceptanceCriteria": ["Given...", "When...", "Then..."],
          "sourceFiles": [],
          "screenshotRoutes": [],
          "dependsOn": []
        }
      ]
    }
  ],
  "newDependencies": [],
  "infrastructureNotes": []
}`;
}

export async function generateEpicStoriesWithAI(
  ctx: EpicStoryGenContext,
  token: vscode.CancellationToken,
  credProvider?: VscodeCredentialProvider,
): Promise<AiAnalysis | null> {
  const config = vscode.workspace.getConfiguration("specPilot");
  const provider = config.get<string>("ai.provider", "auto");
  const prompt = buildEpicStoryPrompt(ctx);

  outputChannel.appendLine(`--- Epic story generation started (provider: ${provider}, epic: ${ctx.epicKey}) ---`);

  const runBedrock = async (): Promise<AiAnalysis | null> => {
    const region = config.get<string>("ai.bedrockRegion") || process.env.AWS_REGION || "us-east-2";
    const profile = config.get<string>("ai.bedrockProfile") || process.env.AWS_PROFILE;
    const modelId = config.get<string>("ai.bedrockModelId") || "us.anthropic.claude-opus-4-6-v1";

    const client = new BedrockRuntimeClient({
      region,
      ...(profile ? { credentials: fromIni({ profile }) } : {}),
    });

    const response = await client.send(
      new ConverseStreamCommand({
        modelId,
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 128000 },
        additionalModelRequestFields: {
          thinking: { type: "enabled", budget_tokens: 50000 },
        },
      }),
      { abortSignal: tokenToAbortSignal(token) },
    );

    let text = "";
    if (response.stream) {
      for await (const event of response.stream) {
        if (event.contentBlockDelta) {
          const delta = event.contentBlockDelta.delta;
          if (delta && "text" in delta && typeof delta.text === "string") {
            text += delta.text;
          }
        }
      }
    }
    if (!text) return null;

    outputChannel.appendLine(`Bedrock: response ${text.length} chars`);
    const parsed = parseJsonResponse<AiAnalysis>(text);
    return validateResponse(parsed);
  };

  const runAnthropic = async (): Promise<AiAnalysis | null> => {
    if (!credProvider) return null;
    const apiKey = await credProvider.getAnthropicApiKey();
    if (!apiKey) return null;

    const modelId = config.get<string>("ai.anthropicModelId") || "claude-sonnet-4-5-20250929";
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream(
      {
        model: modelId,
        max_tokens: 128000,
        thinking: { type: "enabled", budget_tokens: 50000 },
        messages: [{ role: "user", content: prompt }],
      },
      { signal: tokenToAbortSignal(token) },
    );

    let text = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
      }
    }
    if (!text) return null;
    outputChannel.appendLine(`Anthropic: response ${text.length} chars`);
    const parsed = parseJsonResponse<AiAnalysis>(text);
    return validateResponse(parsed);
  };

  const runVscodeLm = async (): Promise<AiAnalysis | null> => {
    const models = await vscode.lm.selectChatModels();
    if (models.length === 0) return null;
    const response = await models[0].sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)], {}, token
    );
    let text = "";
    for await (const chunk of response.text) { text += chunk; }
    if (!text) return null;
    const parsed = parseJsonResponse<AiAnalysis>(text);
    return validateResponse(parsed);
  };

  try {
    if (provider === "bedrock") return await runBedrock();
    if (provider === "anthropic") return await runAnthropic();
    if (provider === "vscode-lm") return await runVscodeLm();

    // Auto: Bedrock -> Anthropic -> vscode.lm
    try {
      const result = await runBedrock();
      if (result) return result;
    } catch (err) {
      outputChannel.appendLine(`Bedrock failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const result = await runAnthropic();
      if (result) return result;
    } catch (err) {
      outputChannel.appendLine(`Anthropic failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return await runVscodeLm();
  } catch (err) {
    outputChannel.appendLine(`Epic story generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
