import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import {
  fetchAllRules,
  getRuleDetail,
  formatState,
  formatScope,
  formatTrigger,
  formatId,
} from "../../src/core/jira/automation-rules.js";
import { server } from "../msw/server.js";
import {
  cloudIdResponse,
  sampleAutomationRules,
} from "../fixtures/jira.js";
import { buildAuthHeader } from "../../src/core/config.js";

const authHeader = buildAuthHeader("dev@example.com", "mock-token-xyz");

describe("fetchAllRules", () => {
  it("fetches a single page of rules", async () => {
    const rules = await fetchAllRules(cloudIdResponse.cloudId, authHeader);
    expect(rules).toEqual(sampleAutomationRules);
  });

  it("paginates when a next cursor is returned", async () => {
    let page = 0;
    const base = `https://api.atlassian.com/automation/public/jira/${cloudIdResponse.cloudId}/rest/v1/rule/summary`;
    server.use(
      http.get(base, () => {
        page++;
        if (page === 1) {
          return HttpResponse.json({
            data: [sampleAutomationRules[0]],
            links: { next: `${base}?cursor=abc` },
          });
        }
        return HttpResponse.json({
          data: [sampleAutomationRules[1]],
          links: {},
        });
      }),
    );
    const rules = await fetchAllRules(cloudIdResponse.cloudId, authHeader);
    expect(rules).toHaveLength(2);
    expect(page).toBe(2);
  });

  it.each([
    [401, /check JIRA_EMAIL/],
    [403, /admin/],
    [404, /Not Found/],
    [500, /HTTP 500/],
  ])("throws descriptive error on %i", async (status, pattern) => {
    const base = `https://api.atlassian.com/automation/public/jira/${cloudIdResponse.cloudId}/rest/v1/rule/summary`;
    server.use(
      http.get(base, () => new HttpResponse("nope", { status })),
    );
    await expect(
      fetchAllRules(cloudIdResponse.cloudId, authHeader),
    ).rejects.toThrow(pattern);
  });
});

describe("getRuleDetail", () => {
  it("fetches a rule by UUID", async () => {
    const rule = (await getRuleDetail(
      cloudIdResponse.cloudId,
      sampleAutomationRules[0].uuid!,
      authHeader,
    )) as { name: string };
    expect(rule.name).toBe(sampleAutomationRules[0].name);
  });
});

describe("format helpers", () => {
  it("formatState handles enabled/disabled/unknown", () => {
    expect(formatState({ id: 1, name: "x", enabled: true })).toBe("ENABLED");
    expect(formatState({ id: 1, name: "x", state: "DISABLED" })).toBe("DISABLED");
    expect(formatState({ id: 1, name: "x" })).toBe("UNKNOWN");
  });

  it("formatScope prefers scope.resources, falls back to projects, then global", () => {
    expect(
      formatScope({
        id: 1,
        name: "x",
        scope: { resources: ["ari:cloud:jira:abc/project/123"] },
      }),
    ).toBe("project:123");
    expect(
      formatScope({ id: 1, name: "x", projects: [{ projectKey: "TEST" }] }),
    ).toBe("TEST");
    expect(formatScope({ id: 1, name: "x" })).toBe("global");
  });

  it("formatTrigger uses component or type, defaults to '-'", () => {
    expect(
      formatTrigger({
        id: 1,
        name: "x",
        trigger: { component: "TRIGGER", type: "jira.issue.created" },
      }),
    ).toBe("TRIGGER");
    expect(
      formatTrigger({
        id: 1,
        name: "x",
        trigger: { type: "jira.issue.created" },
      }),
    ).toBe("jira.issue.created");
    expect(formatTrigger({ id: 1, name: "x" })).toBe("-");
  });

  it("formatId prefers uuid, falls back to id, then '-'", () => {
    expect(formatId({ id: 1, name: "x", uuid: "u" })).toBe("u");
    expect(formatId({ id: 9, name: "x" })).toBe("9");
    expect(formatId({ name: "x" } as { name: string })).toBe("-");
  });
});
