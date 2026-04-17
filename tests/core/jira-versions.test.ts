import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import {
  getVersion,
  updateVersionDescription,
} from "../../src/core/jira/versions.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import { TEST_CREDENTIALS, sampleVersions } from "../fixtures/jira.js";
import { getJiraStore } from "../msw/handlers/jira.js";

describe("getVersion", () => {
  it("returns the matching version from the project", async () => {
    const client = makeTestClient();
    const v = await getVersion(client, "v1.0.0", "TEST");
    expect(v).toMatchObject({ id: "10100", name: "v1.0.0" });
  });

  it("throws when the version is not in the results", async () => {
    const client = makeTestClient();
    await expect(getVersion(client, "v99.99.99", "TEST")).rejects.toThrow(
      /not found/,
    );
  });

  it("throws when the API itself errors", async () => {
    server.use(
      http.get(
        `${TEST_CREDENTIALS.baseUrl}/rest/api/3/project/:key/version`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = makeTestClient();
    await expect(getVersion(client, "v1.0.0", "TEST")).rejects.toThrow(/500/);
  });
});

describe("updateVersionDescription", () => {
  it("sends a PUT and persists description in the store", async () => {
    const client = makeTestClient();
    await updateVersionDescription(
      client,
      sampleVersions[0],
      "Updated description",
    );
    const updated = getJiraStore().versions.get("10100");
    expect(updated?.description).toBe("Updated description");
  });
});
