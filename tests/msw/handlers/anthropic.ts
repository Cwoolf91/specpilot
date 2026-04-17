/**
 * MSW handlers for the Anthropic public API (api.anthropic.com/v1/messages).
 *
 * The default handler returns a simple JSON-shaped message response. Tests that
 * need specific content should override with `server.use(...)` and return a
 * payload matching the shape Claude produces for enhance-issue, generate-release-notes,
 * or generate-analysis prompts.
 */
import { http, HttpResponse } from "msw";

export const DEFAULT_ANTHROPIC_JSON_BODY = {
  summary: "Mock AI-generated summary",
  acceptanceCriteria: ["Given X, when Y, then Z."],
};

export function makeAnthropicTextResponse(text: string) {
  return {
    id: "msg_mock_01",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5-20250929",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

export const anthropicHandlers = [
  http.post("https://api.anthropic.com/v1/messages", () =>
    HttpResponse.json(
      makeAnthropicTextResponse(JSON.stringify(DEFAULT_ANTHROPIC_JSON_BODY)),
    ),
  ),
];
