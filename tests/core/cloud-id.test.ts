import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { getCloudId } from "../../src/core/cloud-id.js";
import { server } from "../msw/server.js";
import { TEST_CREDENTIALS, cloudIdResponse } from "../fixtures/jira.js";

describe("getCloudId", () => {
  it("returns cloudId from tenant_info response", async () => {
    const id = await getCloudId(TEST_CREDENTIALS.baseUrl);
    expect(id).toBe(cloudIdResponse.cloudId);
  });

  it("throws when the response is missing cloudId", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/_edge/tenant_info`, () =>
        HttpResponse.json({}),
      ),
    );
    await expect(getCloudId(TEST_CREDENTIALS.baseUrl)).rejects.toThrow(
      /Cloud ID not found/,
    );
  });

  it("throws a descriptive error on non-200", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/_edge/tenant_info`, () =>
        new HttpResponse("forbidden", { status: 403 }),
      ),
    );
    await expect(getCloudId(TEST_CREDENTIALS.baseUrl)).rejects.toThrow(
      /HTTP 403/,
    );
  });
});
