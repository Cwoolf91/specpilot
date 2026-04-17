import { describe, it, expect } from "vitest";
import { formatPlainText } from "../../src/core/ai/release-notes.js";
import { sampleReleaseNotes } from "../fixtures/jira.js";

describe("formatPlainText", () => {
  it("prepends version header and summary", () => {
    const text = formatPlainText(sampleReleaseNotes, "v1.0.0");
    const lines = text.split("\n");
    expect(lines[0]).toBe("Release Notes — v1.0.0");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe(`Summary: ${sampleReleaseNotes.summary}`);
  });

  it("renders each category with bulleted items", () => {
    const text = formatPlainText(sampleReleaseNotes, "v1.0.0");
    expect(text).toContain("New Features");
    expect(text).toContain("• TEST-101 — Search page layout");
    expect(text).toContain("• TEST-102 — Live search API");
    expect(text).toContain("Improvements");
    expect(text).toContain("• TEST-103 — Faster page load");
  });

  it("handles empty categories gracefully", () => {
    const text = formatPlainText(
      { summary: "empty", categories: [] },
      "v0.0.0",
    );
    expect(text).toContain("Release Notes — v0.0.0");
    expect(text).toContain("Summary: empty");
  });

  it("uses a single blank line separator between categories", () => {
    const text = formatPlainText(sampleReleaseNotes, "v1.0.0");
    // After last item of a category there should be an empty line
    expect(text).toMatch(/• TEST-102 — Live search API\n\nImprovements/);
  });
});
