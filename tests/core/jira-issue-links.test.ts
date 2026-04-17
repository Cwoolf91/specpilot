import { describe, it, expect } from "vitest";
import { createBlocksLink } from "../../src/core/jira/issue-links.js";
import { makeTestClient } from "../fixtures/jira-client.js";
import { getJiraStore } from "../msw/handlers/jira.js";

describe("createBlocksLink", () => {
  it("creates a Blocks link between two issues", async () => {
    const client = makeTestClient();
    await createBlocksLink(client, "TEST-10", "TEST-20");
    expect(getJiraStore().issueLinks).toContainEqual({
      type: "Blocks",
      inward: "TEST-10",
      outward: "TEST-20",
    });
  });
});
