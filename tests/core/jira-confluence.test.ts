import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { publishToConfluence } from "../../src/core/jira/confluence.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import { TEST_CREDENTIALS, sampleReleaseNotes, cloudIdResponse } from "../fixtures/jira.js";
import { getJiraStore } from "../msw/handlers/jira.js";

describe("publishToConfluence", () => {
  it("creates a new page when none exists", async () => {
    const client = makeTestClient();
    const url = await publishToConfluence(
      client,
      sampleReleaseNotes,
      "v1.0.0",
      cloudIdResponse.cloudId,
    );
    expect(url).toMatch(/\/wiki\/spaces\/PT1\/pages\/\d+/);
    const store = getJiraStore();
    expect(store.confluencePages.size).toBe(1);
    const page = [...store.confluencePages.values()][0];
    expect(page.title).toBe("Release Notes — v1.0.0");
    expect(page.version).toBe(1);
  });

  it("updates the existing page when title already exists", async () => {
    // Seed store with a matching page
    const existingId = "2287206500";
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/wiki/api/v2/pages`, () =>
        HttpResponse.json({
          results: [{ id: existingId, version: { number: 3 } }],
        }),
      ),
      http.put(
        `${TEST_CREDENTIALS.baseUrl}/wiki/api/v2/pages/${existingId}`,
        async ({ request }) => {
          const body = (await request.json()) as { version: { number: number } };
          expect(body.version.number).toBe(4);
          return HttpResponse.json({
            id: existingId,
            _links: { webui: `/spaces/PT1/pages/${existingId}` },
          });
        },
      ),
    );
    const client = makeTestClient();
    const url = await publishToConfluence(
      client,
      sampleReleaseNotes,
      "v1.0.0",
      cloudIdResponse.cloudId,
    );
    expect(url).toContain(existingId);
  });

  it("throws on create failure", async () => {
    server.use(
      http.post(`${TEST_CREDENTIALS.baseUrl}/wiki/api/v2/pages`, () =>
        new HttpResponse("create broke", { status: 500 }),
      ),
    );
    const client = makeTestClient();
    await expect(
      publishToConfluence(
        client,
        sampleReleaseNotes,
        "v1.0.0",
        cloudIdResponse.cloudId,
      ),
    ).rejects.toThrow(/Confluence create failed/);
  });
});
