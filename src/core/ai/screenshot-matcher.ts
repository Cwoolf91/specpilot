/**
 * Screenshot-to-story matching via keyword analysis.
 *
 * With story-aware scenarios, matching is built-in (scenarios specify storyKey).
 * This module provides keyword-based fallback for legacy route-based captures.
 */

import type { JiraStoryInfo, ScreenshotMapping } from "../types.js";

export function fallbackMapping(
  stories: JiraStoryInfo[],
  screenshots: Map<string, string>
): ScreenshotMapping[] {
  const nonVisualPatterns =
    /\b(api route|flag|tracking|posthog|middleware|auth setup|feature flag)\b/i;

  const result: ScreenshotMapping[] = [];
  for (const story of stories) {
    if (story.hasAttachments) continue;
    if (nonVisualPatterns.test(story.summary)) continue;

    const summaryWords = story.summary
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const matchedPaths: string[] = [];
    for (const [route, path] of screenshots) {
      const routeLower = route.toLowerCase();
      if (summaryWords.some((w) => routeLower.includes(w))) {
        matchedPaths.push(path);
      }
    }

    if (matchedPaths.length > 0) {
      result.push({
        storyKey: story.key,
        storySummary: story.summary,
        screenshotPaths: matchedPaths,
      });
    }
  }

  return result;
}
