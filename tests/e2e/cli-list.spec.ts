import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { startMockJiraServer, type MockJiraServer } from "./helpers/mock-jira-server.js";

let mock: MockJiraServer;

test.beforeAll(async () => {
  mock = await startMockJiraServer();
});

test.afterAll(async () => {
  await mock.close();
});

function runCli(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", ...args], {
      env: { ...process.env, ...env },
      cwd: process.cwd(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

test("create-epic-stories.ts --list renders the vibe-code epic from the mock", async () => {
  const result = await runCli(
    ["scripts/create-epic-stories.ts", "--list"],
    {
      JIRA_BASE_URL: mock.url,
      JIRA_EMAIL: "e2e@example.com",
      JIRA_API_TOKEN: "e2e-token",
      JIRA_PROJECT_KEY: "E2E",
    },
  );

  if (result.code !== 0) {
    console.error("CLI stdout:", result.stdout);
    console.error("CLI stderr:", result.stderr);
  }
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("E2E-100");
  expect(result.stdout).toContain("E2E Sample Epic");
  expect(result.stdout).toMatch(/Total: 1 epic/);
});
