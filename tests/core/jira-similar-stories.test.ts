import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchSimilarStoriesInEpic } from "../../src/core/jira/similar-stories.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import { TEST_CREDENTIALS, makeIssue } from "../fixtures/jira.js";

describe("fetchSimilarStoriesInEpic", () => {
  it("builds JQL with parent, statusCategory, and optional exclusion", async () => {
    let capturedJql = "";
    const resolved = makeIssue({
      key: "TEST-500",
      summary: "Resolved story",
      parent: { key: "TEST-100", fields: { summary: "Epic" } },
    });
    server.use(
      http.post(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/search/jql`, async ({ request }) => {
        const body = (await request.json()) as { jql: string };
        capturedJql = body.jql;
        return HttpResponse.json({ issues: [resolved] });
      }),
    );
    const client = makeTestClient();
    const stories = await fetchSimilarStoriesInEpic(client, "TEST-100", 3, "TEST-101");
    expect(stories).toHaveLength(1);
    expect(stories[0].key).toBe("TEST-500");
    expect(capturedJql).toContain("parent = TEST-100");
    expect(capturedJql).toContain("statusCategory = Done");
    expect(capturedJql).toContain("key != TEST-101");
    expect(capturedJql).toContain("ORDER BY resolved DESC");
  });

  it("omits exclusion clause when excludeKey not provided", async () => {
    let capturedJql = "";
    server.use(
      http.post(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/search/jql`, async ({ request }) => {
        const body = (await request.json()) as { jql: string };
        capturedJql = body.jql;
        return HttpResponse.json({ issues: [] });
      }),
    );
    const client = makeTestClient();
    await fetchSimilarStoriesInEpic(client, "TEST-100");
    expect(capturedJql).not.toContain("key !=");
  });

  it("returns [] on API error", async () => {
    server.use(
      http.post(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/search/jql`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = makeTestClient();
    expect(await fetchSimilarStoriesInEpic(client, "TEST-100")).toEqual([]);
  });

  it("returns [] for invalid epic key", async () => {
    const client = makeTestClient();
    expect(await fetchSimilarStoriesInEpic(client, "not a key")).toEqual([]);
  });
});
