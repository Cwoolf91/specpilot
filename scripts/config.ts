/**
 * CLI config wrapper — loads .env and exports credentials for CLI scripts.
 * Provides backward-compatible exports used by scripts and mcp-server.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { EnvCredentialProvider, buildAuthHeader } from "../src/core/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

// Load .env immediately for backward compat
import * as dotenv from "dotenv";
dotenv.config({ path: envPath });

// Validate required vars
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || "";

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error(
    "Missing required environment variables in .env\n\n" +
      "Required:\n" +
      '  JIRA_BASE_URL="https://your-site.atlassian.net"\n' +
      '  JIRA_EMAIL="your.email@company.com"\n' +
      '  JIRA_API_TOKEN="your-api-token"\n\n' +
      "Generate an API token at: https://id.atlassian.com/manage-profile/security/api-tokens"
  );
  process.exit(1);
}

const AUTH_HEADER = buildAuthHeader(JIRA_EMAIL, JIRA_API_TOKEN);

// Create a credential provider for core functions
const credentialProvider = new EnvCredentialProvider(envPath);

export {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  PROJECT_KEY,
  AUTH_HEADER,
  credentialProvider,
};
