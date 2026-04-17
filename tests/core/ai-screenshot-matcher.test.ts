import { describe, it, expect } from "vitest";
import { fallbackMapping } from "../../src/core/ai/screenshot-matcher.js";
import type { JiraStoryInfo } from "../../src/core/types.js";

function story(overrides: Partial<JiraStoryInfo>): JiraStoryInfo {
  return {
    key: "TEST-1",
    summary: "placeholder",
    description: "",
    hasAttachments: false,
    attachmentCount: 0,
    ...overrides,
  };
}

describe("fallbackMapping", () => {
  it("matches stories to screenshots by keyword overlap", () => {
    const stories = [
      story({ key: "TEST-101", summary: "Search page layout" }),
      story({ key: "TEST-102", summary: "Profile settings" }),
    ];
    const screenshots = new Map([
      ["/search", "/tmp/search.png"],
      ["/profile/settings", "/tmp/profile.png"],
    ]);
    const result = fallbackMapping(stories, screenshots);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      storyKey: "TEST-101",
      screenshotPaths: ["/tmp/search.png"],
    });
    expect(result[1]).toMatchObject({
      storyKey: "TEST-102",
      screenshotPaths: ["/tmp/profile.png"],
    });
  });

  it("skips stories with existing attachments", () => {
    const stories = [
      story({
        key: "TEST-1",
        summary: "Search page",
        hasAttachments: true,
        attachmentCount: 1,
      }),
    ];
    const screenshots = new Map([["/search", "/tmp/s.png"]]);
    expect(fallbackMapping(stories, screenshots)).toEqual([]);
  });

  it.each([
    "Add API route for posts",
    "Introduce posthog tracking",
    "Feature flag gating",
    "Add middleware",
    "Auth setup",
  ])("skips non-visual story summary: %s", (summary) => {
    const stories = [story({ key: "TEST-1", summary })];
    const screenshots = new Map([["/search", "/tmp/s.png"]]);
    expect(fallbackMapping(stories, screenshots)).toEqual([]);
  });

  it("returns nothing when no keyword overlaps", () => {
    const stories = [story({ key: "TEST-1", summary: "Abstract story" })];
    const screenshots = new Map([["/search", "/tmp/s.png"]]);
    expect(fallbackMapping(stories, screenshots)).toEqual([]);
  });

  it("short words (<=2 chars) aren't used for matching", () => {
    // "Is at home" has no words with length > 2 except "home"; route /is should not match.
    const stories = [story({ key: "TEST-1", summary: "UI an IS ok" })];
    const screenshots = new Map([["/is", "/tmp/s.png"]]);
    expect(fallbackMapping(stories, screenshots)).toEqual([]);
  });

  it("matches all screenshots whose route contains a story keyword", () => {
    const stories = [story({ key: "TEST-1", summary: "Search experience" })];
    const screenshots = new Map([
      ["/search", "/tmp/a.png"],
      ["/search/results", "/tmp/b.png"],
      ["/profile", "/tmp/c.png"],
    ]);
    const result = fallbackMapping(stories, screenshots);
    expect(result[0].screenshotPaths).toHaveLength(2);
    expect(result[0].screenshotPaths).toEqual(
      expect.arrayContaining(["/tmp/a.png", "/tmp/b.png"]),
    );
  });
});
