/**
 * Mock for `@aws-sdk/client-bedrock-runtime` and `@aws-sdk/credential-providers`.
 *
 * The real SDK uses a command-dispatch pattern: `client.send(new ConverseCommand(...))`.
 * This mock mirrors that shape so imports in `src/extension/ai/*` remain drop-in.
 *
 * Queue text responses with `queueBedrockText(...)` or `queueBedrockError(...)`
 * before tests run; the mock returns them in FIFO order.
 */
import { vi } from "vitest";

export interface BedrockConverseResponse {
  output: {
    message: {
      role: "assistant";
      content: Array<{ text?: string; reasoningContent?: { reasoningText: { text: string } } }>;
    };
  };
  stopReason: "end_turn" | "max_tokens" | "stop_sequence";
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export function mockBedrockTextResponse(text: string): BedrockConverseResponse {
  return {
    output: { message: { role: "assistant", content: [{ text }] } },
    stopReason: "end_turn",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  };
}

const responseQueue: Array<BedrockConverseResponse | Error> = [];

export function queueBedrockResponse(response: BedrockConverseResponse | Error): void {
  responseQueue.push(response);
}

export function queueBedrockText(text: string): void {
  responseQueue.push(mockBedrockTextResponse(text));
}

export function queueBedrockJson(payload: unknown): void {
  responseQueue.push(mockBedrockTextResponse(JSON.stringify(payload)));
}

export function queueBedrockError(err: Error): void {
  responseQueue.push(err);
}

export function resetBedrockMock(): void {
  responseQueue.length = 0;
  BedrockRuntimeClient.mock.clear();
  sendMock.mockClear();
  converseStreamMock.mockClear();
}

export const sendMock = vi.fn(async () => {
  const next = responseQueue.shift();
  if (next instanceof Error) throw next;
  if (next) return next;
  return mockBedrockTextResponse("{}");
});

// ConverseStreamCommand returns an async-iterable stream
export const converseStreamMock = vi.fn(async () => {
  const next = responseQueue.shift();
  if (next instanceof Error) throw next;
  const text =
    next?.output?.message?.content?.[0]?.text ?? "{}";
  return {
    stream: (async function* () {
      yield { contentBlockDelta: { delta: { text } } };
      yield {
        messageStop: { stopReason: "end_turn" },
      };
    })(),
  };
});

export class BedrockRuntimeClient {
  static mock = { instances: [] as BedrockRuntimeClient[], clear() { this.instances.length = 0; } };
  config: unknown;
  constructor(config: unknown) {
    this.config = config;
    BedrockRuntimeClient.mock.instances.push(this);
  }
  async send(command: { constructor: { name: string } }) {
    if (command.constructor.name === "ConverseStreamCommand") {
      return converseStreamMock();
    }
    return sendMock();
  }
}

export class ConverseCommand {
  input: unknown;
  constructor(input: unknown) {
    this.input = input;
  }
}

export class ConverseStreamCommand {
  input: unknown;
  constructor(input: unknown) {
    this.input = input;
  }
}

// --- credential-providers mock ---
export const fromIni = vi.fn((opts: { profile?: string }) => {
  return async () => ({
    accessKeyId: "MOCK_KEY_ID",
    secretAccessKey: "MOCK_SECRET",
    sessionToken: "MOCK_SESSION",
    // Include profile for test visibility
    ...(opts?.profile ? { profile: opts.profile } : {}),
  });
});
