import { describe, it, expect } from "vitest";

describe("smoke test — vitest node env", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("has globals available", () => {
    expect(typeof globalThis.fetch).toBe("function");
  });
});
