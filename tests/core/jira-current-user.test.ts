import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { getCurrentUser } from "../../src/core/jira/current-user.js";
import { server } from "../msw/server.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import { TEST_CREDENTIALS, myselfResponse } from "../fixtures/jira.js";

describe("getCurrentUser", () => {
  it("returns the authenticated user", async () => {
    const client = makeTestClient();
    const me = await getCurrentUser(client);
    expect(me).toEqual({
      accountId: myselfResponse.accountId,
      displayName: myselfResponse.displayName,
      emailAddress: myselfResponse.emailAddress,
    });
  });

  it("returns null on API error", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/myself`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = makeTestClient();
    expect(await getCurrentUser(client)).toBeNull();
  });

  it("returns null when response is missing required fields", async () => {
    server.use(
      http.get(`${TEST_CREDENTIALS.baseUrl}/rest/api/3/myself`, () =>
        HttpResponse.json({ emailAddress: "x@y.com" }),
      ),
    );
    const client = makeTestClient();
    expect(await getCurrentUser(client)).toBeNull();
  });
});
