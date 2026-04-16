/**
 * Get full configuration for a specific Jira automation rule by UUID.
 *
 * Usage:
 *   npx tsx scripts/get-rule-detail.ts <ruleUuid>
 *   npx tsx scripts/get-rule-detail.ts <uuid1> <uuid2> ...
 */

import { JIRA_BASE_URL, AUTH_HEADER } from "./config.js";
import { getCloudId } from "../src/core/cloud-id.js";
import { getRuleDetail } from "../src/core/jira/automation-rules.js";

async function main() {
  const uuids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (uuids.length === 0) {
    console.error(
      "Usage: npx tsx scripts/get-rule-detail.ts <ruleUuid> [<ruleUuid2> ...]"
    );
    process.exit(1);
  }

  const cloudId = await getCloudId(JIRA_BASE_URL!);

  for (const uuid of uuids) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Rule: ${uuid}`);
    console.log("=".repeat(70));
    const detail = await getRuleDetail(cloudId, uuid, AUTH_HEADER);
    console.log(JSON.stringify(detail, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
