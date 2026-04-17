import { describe, it, expect, vi } from "vitest";
import {
  extractTextFromAdf,
  sleep,
  pollUntil,
  validateShellArg,
  escapeJqlString,
  validateIssueKey,
  validateProjectKey,
  parseJsonResponse,
} from "../../src/core/utils.js";

describe("extractTextFromAdf", () => {
  it("returns empty string for null/undefined/primitives", () => {
    expect(extractTextFromAdf(null)).toBe("");
    expect(extractTextFromAdf(undefined)).toBe("");
    expect(extractTextFromAdf("hello")).toBe("");
    expect(extractTextFromAdf(42)).toBe("");
  });

  it("extracts a leaf text node", () => {
    expect(extractTextFromAdf({ type: "text", text: "hello" })).toBe("hello");
  });

  it("walks nested content arrays and concatenates leaf text", () => {
    const doc = {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "hello " },
            { type: "text", text: "world" },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "!" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(extractTextFromAdf(doc)).toBe("hello world!");
  });

  it("returns empty string for nodes without content or text", () => {
    expect(extractTextFromAdf({ type: "rule" })).toBe("");
  });
});

describe("sleep", () => {
  it("resolves after the given delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await promise;
    vi.useRealTimers();
  });
});

describe("pollUntil", () => {
  it("returns true as soon as check() succeeds", async () => {
    let calls = 0;
    const check = vi.fn(async () => ++calls >= 3);
    const result = await pollUntil(check, 1, 1000);
    expect(result).toBe(true);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("returns false once the timeout elapses", async () => {
    const check = vi.fn(async () => false);
    const result = await pollUntil(check, 5, 20);
    expect(result).toBe(false);
    expect(check).toHaveBeenCalled();
  });
});

describe("validateShellArg", () => {
  it("passes clean values", () => {
    expect(() => validateShellArg("main", "branch")).not.toThrow();
    expect(() => validateShellArg("feature/x-1", "branch")).not.toThrow();
  });

  it.each([
    ["`rm -rf /`"],
    ["$(whoami)"],
    ["foo;bar"],
    ["foo|bar"],
    ["foo&bar"],
    ["foo<bar"],
    ["foo>bar"],
  ])("rejects %s", (value) => {
    expect(() => validateShellArg(value, "arg")).toThrow(/unsafe/);
  });
});

describe("escapeJqlString", () => {
  it("escapes backslashes and double quotes", () => {
    expect(escapeJqlString('he said "hi"')).toBe('he said \\"hi\\"');
    expect(escapeJqlString("c:\\path")).toBe("c:\\\\path");
  });

  it("leaves plain text untouched", () => {
    expect(escapeJqlString("plain text")).toBe("plain text");
  });
});

describe("validateIssueKey", () => {
  it("accepts valid keys", () => {
    expect(validateIssueKey("PROJ-1")).toBe("PROJ-1");
    expect(validateIssueKey("ABC_D-123")).toBe("ABC_D-123");
  });

  it("rejects malformed keys", () => {
    expect(() => validateIssueKey("proj-1")).toThrow(/Invalid/);
    expect(() => validateIssueKey("PROJ")).toThrow(/Invalid/);
    expect(() => validateIssueKey("PROJ-abc")).toThrow(/Invalid/);
    expect(() => validateIssueKey("")).toThrow(/Invalid/);
  });
});

describe("validateProjectKey", () => {
  it("accepts valid keys", () => {
    expect(validateProjectKey("PROJ")).toBe("PROJ");
    expect(validateProjectKey("ABC_D")).toBe("ABC_D");
  });

  it("rejects malformed keys", () => {
    expect(() => validateProjectKey("proj")).toThrow(/Invalid/);
    expect(() => validateProjectKey("A")).toThrow(/Invalid/);
    expect(() => validateProjectKey("A-1")).toThrow(/Invalid/);
  });
});

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse<{ a: number }>(`{"a":1}`)).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const text = '```json\n{"a":2}\n```';
    expect(parseJsonResponse<{ a: number }>(text)).toEqual({ a: 2 });
  });

  it("strips bare ``` fences", () => {
    const text = '```\n{"a":3}\n```';
    expect(parseJsonResponse<{ a: number }>(text)).toEqual({ a: 3 });
  });

  it("throws a descriptive error for unrecoverable input", () => {
    expect(() => parseJsonResponse("definitely not json")).toThrow(
      /Failed to parse JSON/,
    );
  });
});
