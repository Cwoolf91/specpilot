/**
 * Mock for `@anthropic-ai/sdk`. Used via `vi.mock("@anthropic-ai/sdk", ...)` to
 * stub the default export's `messages.create`. Tests can queue responses, force
 * errors, or inspect recorded calls.
 */
import { vi } from "vitest";

export interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{ type: "text"; text: string }>;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence";
  usage: { input_tokens: number; output_tokens: number };
}

export function mockAnthropicTextResponse(text: string): AnthropicMessageResponse {
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5-mock",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

const responseQueue: Array<AnthropicMessageResponse | Error> = [];
export const messagesCreate = vi.fn(async () => {
  const next = responseQueue.shift();
  if (next instanceof Error) throw next;
  if (next) return next;
  return mockAnthropicTextResponse("{}");
});

export function queueAnthropicResponse(response: AnthropicMessageResponse | Error): void {
  responseQueue.push(response);
}

export function queueAnthropicText(text: string): void {
  responseQueue.push(mockAnthropicTextResponse(text));
}

export function queueAnthropicJson(payload: unknown): void {
  responseQueue.push(mockAnthropicTextResponse(JSON.stringify(payload)));
}

export function resetAnthropicMock(): void {
  responseQueue.length = 0;
  messagesCreate.mockClear();
}

export class MockAnthropic {
  apiKey: string;
  messages = { create: messagesCreate };
  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }
}

// Default export shape matching `import Anthropic from "@anthropic-ai/sdk"`
export default MockAnthropic;
