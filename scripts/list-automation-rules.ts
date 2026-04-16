/**
 * List Jira Cloud automation rules using the Automation REST API.
 *
 * Usage:
 *   npx tsx scripts/list-automation-rules.ts
 *   npx tsx scripts/list-automation-rules.ts --verbose
 */

import { JIRA_BASE_URL, AUTH_HEADER } from "./config.js";
import { getCloudId } from "../src/core/cloud-id.js";
import {
  fetchAllRules,
  formatState,
  formatScope,
  formatTrigger,
  formatId,
} from "../src/core/jira/automation-rules.js";
import type { RuleSummary } from "../src/core/types.js";

function parseArgs(): { verbose: boolean } {
  const args = process.argv.slice(2);
  return { verbose: args.includes("--verbose") || args.includes("-v") };
}

function printTable(rules: RuleSummary[]) {
  const cols = { id: 40, state: 10, scope: 18 };
  const header =
    "UUID/ID".padEnd(cols.id) +
    "State".padEnd(cols.state) +
    "Scope".padEnd(cols.scope) +
    "Name";
  console.log(header);
  console.log("-".repeat(header.length + 30));

  for (const rule of rules) {
    console.log(
      formatId(rule).padEnd(cols.id) +
        formatState(rule).padEnd(cols.state) +
        formatScope(rule).padEnd(cols.scope) +
        (rule.name || "(unnamed)")
    );
  }
}

function printVerbose(rules: RuleSummary[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Detailed Rule Data");
  console.log("=".repeat(60));

  for (const rule of rules) {
    console.log(`\n--- ${rule.name} ---`);
    console.log(`  UUID:      ${rule.uuid ?? "-"}`);
    console.log(`  ID:        ${rule.id ?? "-"}`);
    console.log(`  State:     ${formatState(rule)}`);
    console.log(`  Trigger:   ${formatTrigger(rule)}`);
    console.log(`  Scope:     ${formatScope(rule)}`);
    if (rule.description) console.log(`  Desc:      ${rule.description}`);
    if (rule.authorAccountId)
      console.log(`  Author:    ${rule.authorAccountId}`);
    if (rule.tags?.length) {
      console.log(
        `  Tags:      ${rule.tags.map((t) => `${t.tagType}:${t.tagValue}`).join(", ")}`
      );
    }
    console.log(`  JSON:      ${JSON.stringify(rule)}`);
  }
}

async function main() {
  const { verbose } = parseArgs();

  console.log(`\nJira Cloud Automation Rules`);
  console.log(`Instance: ${JIRA_BASE_URL}`);
  console.log("=".repeat(50));

  console.log("Resolving Cloud ID...");
  const cloudId = await getCloudId(JIRA_BASE_URL!);
  console.log(`Cloud ID: ${cloudId}\n`);

  const rules = await fetchAllRules(cloudId, AUTH_HEADER);

  if (rules.length === 0) {
    console.log("No automation rules found.");
    return;
  }

  rules.sort((a, b) => {
    const aOn = formatState(a) === "ENABLED" ? 0 : 1;
    const bOn = formatState(b) === "ENABLED" ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    return (a.name || "").localeCompare(b.name || "");
  });

  const enabled = rules.filter((r) => formatState(r) === "ENABLED").length;
  const disabled = rules.length - enabled;
  console.log(
    `Found ${rules.length} rules (${enabled} enabled, ${disabled} disabled)\n`
  );

  printTable(rules);
  if (verbose) printVerbose(rules);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
