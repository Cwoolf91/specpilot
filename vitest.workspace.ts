import { defineWorkspace } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const vscodeMock = path.join(root, "tests/mocks/vscode.ts");

export default defineWorkspace([
  {
    // Node-environment unit tests: src/core + src/extension + scripts
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      environment: "node",
      include: [
        "tests/core/**/*.test.ts",
        "tests/extension/**/*.test.ts",
        "tests/scripts/**/*.test.ts",
      ],
      setupFiles: [path.join(root, "tests/setup/vitest.setup.ts")],
      alias: {
        vscode: vscodeMock,
      },
      globals: true,
    },
  },
  {
    // jsdom webview/component tests
    extends: "./vitest.config.ts",
    plugins: [react()],
    test: {
      name: "webview",
      environment: "jsdom",
      include: ["tests/webview/**/*.test.{ts,tsx}"],
      setupFiles: [path.join(root, "tests/setup/jsdom.setup.ts")],
      globals: true,
    },
  },
]);
