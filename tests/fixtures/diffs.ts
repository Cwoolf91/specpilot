/**
 * Sample git-diff output and categorization/route-detection inputs.
 * These stand in for the output of generateDiff() in tests.
 */
export const SAMPLE_STAT_SUMMARY = ` apps/web/pages/search.tsx | 120 ++++++++++
 apps/web/pages/api/search.ts | 42 ++++
 apps/web/components/SearchBar.tsx | 58 +++
 apps/web/styles/search.css | 12 +
 apps/web/components/__tests__/SearchBar.test.tsx | 34 +++
 README.md | 6 +
 6 files changed, 272 insertions(+)`;

export const SAMPLE_CATEGORIES: Record<string, string[]> = {
  "Pages / Routes": ["apps/web/pages/search.tsx", "apps/web/pages/api/search.ts"],
  Components: ["apps/web/components/SearchBar.tsx"],
  Styles: ["apps/web/styles/search.css"],
  Tests: ["apps/web/components/__tests__/SearchBar.test.tsx"],
  Docs: ["README.md"],
};

export const SAMPLE_ROUTES: string[] = ["/search"];

export const EMPTY_DIFF = "";
