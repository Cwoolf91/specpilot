import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fetchBoards,
  fetchSprints,
  moveToSprint,
} from "../../src/core/jira/sprints.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import {
  TEST_CREDENTIALS,
  sampleBoards,
  sampleSprints,
} from "../fixtures/jira.js";
import { getJiraStore } from "../msw/handlers/jira.js";

describe("fetchBoards", () => {
  it("returns board values for a project", async () => {
    const client = makeTestClient();
    const boards = await fetchBoards(client, "TEST");
    expect(boards).toEqual(sampleBoards);
  });

  it("returns [] when the API errors", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/board`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = makeTestClient();
    expect(await fetchBoards(client, "TEST")).toEqual([]);
  });
});

describe("fetchSprints", () => {
  it("returns sprint values for a board", async () => {
    const client = makeTestClient();
    const sprints = await fetchSprints(client, 42);
    expect(sprints).toEqual(sampleSprints);
  });

  it("returns [] when the API errors", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/agile/1.0/board/:id/sprint`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = makeTestClient();
    expect(await fetchSprints(client, 42)).toEqual([]);
  });
});

describe("moveToSprint", () => {
  it("POSTs issues to the sprint endpoint", async () => {
    const client = makeTestClient();
    await moveToSprint(client, "1001", ["TEST-1", "TEST-2"]);
    const assignments = getJiraStore().sprintAssignments.get("1001");
    expect(assignments).toEqual(["TEST-1", "TEST-2"]);
  });
});
