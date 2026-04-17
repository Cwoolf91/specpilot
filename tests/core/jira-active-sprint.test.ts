import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { findActiveSprint, fetchSprintIssues } from "../../src/core/jira/active-sprint.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import {
  TEST_CREDENTIALS,
  sampleBoards,
  sampleSprints,
  sampleStories,
} from "../fixtures/jira.js";

describe("findActiveSprint", () => {
  it("returns the first active sprint for the project's first scrum board", async () => {
    const client = makeTestClient();
    const result = await findActiveSprint(client, "TEST");
    expect(result).toEqual({
      boardId: sampleBoards[0].id,
      sprint: sampleSprints[0], // active
    });
  });

  it("returns null when project has no board", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/board`, () =>
        HttpResponse.json({ values: [] }),
      ),
    );
    const client = makeTestClient();
    expect(await findActiveSprint(client, "TEST")).toBeNull();
  });

  it("returns null when the board has no active sprint", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/board/:id/sprint`, () =>
        HttpResponse.json({ values: [] }),
      ),
    );
    const client = makeTestClient();
    expect(await findActiveSprint(client, "TEST")).toBeNull();
  });

  it("returns null on API error", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/board`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = makeTestClient();
    expect(await findActiveSprint(client, "TEST")).toBeNull();
  });
});

describe("fetchSprintIssues", () => {
  it("fetches issues from the sprint and forwards JQL filter", async () => {
    let capturedJql: string | null = null;
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/sprint/:id/issue`, ({ request }) => {
        const url = new URL(request.url);
        capturedJql = url.searchParams.get("jql");
        return HttpResponse.json({ issues: sampleStories });
      }),
    );
    const client = makeTestClient();
    const issues = await fetchSprintIssues(client, 1001, {
      jql: "assignee is EMPTY",
      maxResults: 25,
    });
    expect(issues).toEqual(sampleStories);
    expect(capturedJql).toBe("assignee is EMPTY");
  });

  it("returns [] when the API errors", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/sprint/:id/issue`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = makeTestClient();
    expect(await fetchSprintIssues(client, 1001)).toEqual([]);
  });
});
