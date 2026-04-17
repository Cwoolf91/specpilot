import { defineConfig } from "vitest/config";

// Shared config used by vitest.workspace.ts projects. The workspace file is
// the entry point — vitest runs the "unit" and "webview" projects in parallel.
export default defineConfig({
  test: {
    // Fail fast when a test has an unhandled promise rejection.
    dangerouslyIgnoreUnhandledErrors: false,
    // Integration (vscode/test-electron) + Playwright E2E live outside vitest.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/webview-dist/**",
      "tests/integration/**",
      "tests/e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "src/core/**/*.ts",
        "src/extension/**/*.ts",
        "src/webview/**/*.{ts,tsx}",
        "scripts/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/index.ts",
        "**/index.tsx",
        "src/webview/vscode-api.ts",
        "src/core/types.ts",
        "scripts/config.ts",
        "scripts/jira-client.ts",
        "node_modules/**",
        "tests/**",
        "out/**",
        "webview-dist/**",
      ],
      thresholds: {
        // Tunable. Start permissive; tighten as coverage grows.
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 60,
      },
    },
  },
});
