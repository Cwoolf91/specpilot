/**
 * Credential provider implementations.
 *
 * Core logic uses the CredentialProvider interface.
 * CLI scripts use EnvCredentialProvider (reads .env).
 * VS Code extension uses VscodeCredentialProvider (SecretStorage + .env fallback).
 */

import type { JiraCredentials, CredentialProvider } from "./types.js";

export class EnvCredentialProvider implements CredentialProvider {
  private credentials: JiraCredentials | null = null;

  constructor(private envPath?: string) {}

  async getCredentials(): Promise<JiraCredentials> {
    if (this.credentials) return this.credentials;

    // Load dotenv if an env path is provided
    if (this.envPath) {
      const dotenv = await import("dotenv");
      dotenv.config({ path: this.envPath });
    }

    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;
    const projectKey = process.env.JIRA_PROJECT_KEY || "";
    if (!baseUrl || !email || !apiToken) {
      throw new Error(
        "Missing required environment variables in .env\n\n" +
          "Required:\n" +
          '  JIRA_BASE_URL="https://your-site.atlassian.net"\n' +
          '  JIRA_EMAIL="your.email@company.com"\n' +
          '  JIRA_API_TOKEN="your-api-token"\n\n' +
          "Generate an API token at: https://id.atlassian.com/manage-profile/security/api-tokens"
      );
    }

    this.credentials = {
      baseUrl,
      email,
      apiToken,
      projectKey,
    };

    return this.credentials;
  }
}

export function buildAuthHeader(email: string, apiToken: string): string {
  return "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
}

export { type JiraCredentials, type CredentialProvider } from "./types.js";
