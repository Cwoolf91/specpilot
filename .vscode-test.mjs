import { defineConfig } from "@vscode/test-cli";

// VS Code integration tests run in a real Extension Host instance.
// `npm run build:integration` compiles tests/integration/**/*.ts to
// out/test/**/*.js and drops a {"type":"commonjs"} package.json so
// Node loads the emitted files as CommonJS (despite the root being ESM).
export default defineConfig({
  files: "out/test/**/*.test.js",
  version: "stable",
  mocha: {
    ui: "bdd",
    timeout: 60_000,
    color: true,
  },
  launchArgs: [
    "--disable-extensions",
    "--disable-workspace-trust",
  ],
});
