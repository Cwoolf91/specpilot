import * as vscode from "vscode";
import type { CredentialProvider, JiraCredentials } from "../core/types.js";

const SECRET_KEYS = {
  baseUrl: "specPilot.baseUrl",
  email: "specPilot.email",
  apiToken: "specPilot.apiToken",
  projectKey: "specPilot.projectKey",
  anthropicApiKey: "specPilot.anthropicApiKey",
} as const;

export class VscodeCredentialProvider implements CredentialProvider {
  constructor(private secrets: vscode.SecretStorage) {}

  async getCredentials(): Promise<JiraCredentials> {
    const baseUrl = await this.secrets.get(SECRET_KEYS.baseUrl);
    const email = await this.secrets.get(SECRET_KEYS.email);
    const apiToken = await this.secrets.get(SECRET_KEYS.apiToken);
    const projectKey = await this.secrets.get(SECRET_KEYS.projectKey);

    if (baseUrl && email && apiToken && projectKey) {
      return { baseUrl, email, apiToken, projectKey };
    }

    // Fallback: try .env via dotenv
    const envCreds = this.loadEnvFallback();
    if (envCreds) return envCreds;

    throw new Error(
      "Jira credentials not configured. Run 'SpecPilot: Set Credentials'."
    );
  }

  async storeCredentials(creds: JiraCredentials): Promise<void> {
    await this.secrets.store(SECRET_KEYS.baseUrl, creds.baseUrl);
    await this.secrets.store(SECRET_KEYS.email, creds.email);
    await this.secrets.store(SECRET_KEYS.apiToken, creds.apiToken);
    await this.secrets.store(SECRET_KEYS.projectKey, creds.projectKey);
  }

  async hasCredentials(): Promise<boolean> {
    try {
      await this.getCredentials();
      return true;
    } catch {
      return false;
    }
  }

  async getAnthropicApiKey(): Promise<string | null> {
    const key = await this.secrets.get(SECRET_KEYS.anthropicApiKey);
    if (key) return key;
    return process.env.ANTHROPIC_API_KEY || null;
  }

  async storeAnthropicApiKey(key: string): Promise<void> {
    await this.secrets.store(SECRET_KEYS.anthropicApiKey, key);
  }

  async hasAnthropicApiKey(): Promise<boolean> {
    const key = await this.getAnthropicApiKey();
    return key !== null && key.length > 0;
  }

  private loadEnvFallback(): JiraCredentials | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("dotenv").config();
    } catch {
      // dotenv not available in bundled extension — that's fine
    }

    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL;
    const apiToken = process.env.JIRA_API_TOKEN;
    const projectKey = process.env.JIRA_PROJECT_KEY || "";

    if (!baseUrl || !email || !apiToken) return null;

    return { baseUrl, email, apiToken, projectKey };
  }
}
