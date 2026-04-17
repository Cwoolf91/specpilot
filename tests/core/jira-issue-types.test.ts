import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import {
  discoverIssueTypes,
  discoverProjects,
  resolveIssueTypeId,
  getIssueTypes,
  getProjects,
  clearDiscoveryCache,
} from "../../src/core/jira/issue-types.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import { TEST_CREDENTIALS, issueTypesResponse, projectsResponse } from "../fixtures/jira.js";

beforeEach(() => clearDiscoveryCache());
afterEach(() => clearDiscoveryCache());

describe("discoverIssueTypes", () => {
  it("returns name -> id map from GET /rest/api/3/issuetype", async () => {
    const client = makeTestClient();
    const map = await discoverIssueTypes(client);
    expect(map).toMatchObject({ Epic: "10001", Story: "10002", Bug: "10014" });
  });
});

describe("resolveIssueTypeId", () => {
  it("returns the mapped id", () => {
    expect(resolveIssueTypeId({ Story: "x" }, "Story")).toBe("x");
  });

  it("throws with a list of available types when missing", () => {
    expect(() => resolveIssueTypeId({ Story: "1", Bug: "2" }, "Epic")).toThrow(
      /Story, Bug/,
    );
  });
});

describe("discoverProjects", () => {
  it("returns simplified key/name list", async () => {
    const client = makeTestClient();
    const projects = await discoverProjects(client);
    expect(projects).toEqual(projectsResponse);
  });
});

describe("getIssueTypes caching", () => {
  it("caches subsequent calls within TTL", async () => {
    let callCount = 0;
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/issuetype`, () => {
        callCount++;
        return HttpResponse.json(issueTypesResponse);
      }),
    );
    const client = makeTestClient();
    await getIssueTypes(client);
    await getIssueTypes(client);
    expect(callCount).toBe(1);
  });

  it("clearDiscoveryCache forces a refetch", async () => {
    let callCount = 0;
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/issuetype`, () => {
        callCount++;
        return HttpResponse.json(issueTypesResponse);
      }),
    );
    const client = makeTestClient();
    await getIssueTypes(client);
    clearDiscoveryCache();
    await getIssueTypes(client);
    expect(callCount).toBe(2);
  });
});

describe("getProjects caching", () => {
  it("caches results across calls", async () => {
    let callCount = 0;
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/project`, () => {
        callCount++;
        return HttpResponse.json(projectsResponse);
      }),
    );
    const client = makeTestClient();
    await getProjects(client);
    await getProjects(client);
    expect(callCount).toBe(1);
  });
});
