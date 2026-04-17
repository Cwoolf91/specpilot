import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import {
  createJiraClient,
  createJiraClientSync,
} from "../../src/core/jira-client.js";
import type { CredentialProvider } from "../../src/core/types.js";
import { server } from "../msw/server.js";
import { TEST_CREDENTIALS } from "../fixtures/jira.js";

describe("createJiraClient", () => {
  it("resolves credentials from the provider", async () => {
    const provider: CredentialProvider = {
      getCredentials: async () => ({ ...TEST_CREDENTIALS }),
    };
    const client = await createJiraClient(provider);
    expect(client.credentials.baseUrl).toBe(TEST_CREDENTIALS.baseUrl);
    expect(typeof client.jiraFetch).toBe("function");
    expect(typeof client.uploadAttachment).toBe("function");
  });
});

describe("jiraFetch", () => {
  it("prepends baseUrl for relative paths and attaches auth header", async () => {
    let capturedAuth: string | null = null;
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/myself`, ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json({ accountId: "x" });
      }),
    );
    const client = createJiraClientSync({ ...TEST_CREDENTIALS });
    const res = await client.jiraFetch("/rest/api/3/myself");
    await res.json();
    expect(capturedAuth).toMatch(/^Basic /);
    // base64("dev@example.com:mock-token-xyz") verifies the exact encoding
    const expected =
      "Basic " + Buffer.from("dev@example.com:mock-token-xyz").toString("base64");
    expect(capturedAuth).toBe(expected);
  });

  it("uses absolute URLs as-is", async () => {
    server.use(
      http.get("https://third-party.example/ping", () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const client = createJiraClientSync({ ...TEST_CREDENTIALS });
    const res = await client.jiraFetch("https://third-party.example/ping");
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("throws a descriptive error on non-ok responses", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/boom`, () =>
        new HttpResponse("upstream broken", { status: 503 }),
      ),
    );
    const client = createJiraClientSync({ ...TEST_CREDENTIALS });
    await expect(client.jiraFetch("/rest/api/3/boom")).rejects.toThrow(
      /Jira API 503/,
    );
  });

  it("strips query strings from the error message", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/secret`, () =>
        new HttpResponse("no", { status: 401 }),
      ),
    );
    const client = createJiraClientSync({ ...TEST_CREDENTIALS });
    await expect(
      client.jiraFetch("/rest/api/3/secret?token=abc"),
    ).rejects.toThrow(/\/rest\/api\/3\/secret(?!\?)/);
  });
});
