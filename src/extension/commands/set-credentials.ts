import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";

export function registerSetCredentials(
  context: vscode.ExtensionContext,
  credProvider: VscodeCredentialProvider,
  onCredentialsChanged: () => void
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("specPilot.setCredentials", async () => {
      // Load existing creds so users can skim past fields they don't want to change.
      let existing: { baseUrl: string; email: string; apiToken: string; projectKey: string } | null = null;
      try {
        existing = await credProvider.getCredentials();
      } catch {
        // Not configured yet — first-time setup.
      }

      const baseUrl = await vscode.window.showInputBox({
        title: "Jira Base URL" + (existing ? " (leave unchanged to keep current)" : ""),
        prompt: "e.g. https://yoursite.atlassian.net",
        value: existing?.baseUrl ?? "",
        ignoreFocusOut: true,
      });
      if (baseUrl === undefined) return;

      const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
      if (!/^https:\/\/.+/.test(trimmedUrl)) {
        vscode.window.showErrorMessage("Jira Base URL must use HTTPS (e.g., https://yoursite.atlassian.net).");
        return;
      }

      const email = await vscode.window.showInputBox({
        title: "Jira Email" + (existing ? " (leave unchanged to keep current)" : ""),
        prompt: "Your Atlassian account email",
        value: existing?.email ?? "",
        ignoreFocusOut: true,
      });
      if (email === undefined) return;

      const apiTokenInput = await vscode.window.showInputBox({
        title: "Jira API Token" + (existing ? " (leave blank to keep current)" : ""),
        prompt: existing
          ? "Press Enter without typing to keep the existing token"
          : "Create at https://id.atlassian.net/manage-profile/security/api-tokens",
        password: true,
        ignoreFocusOut: true,
      });
      if (apiTokenInput === undefined) return;
      const apiToken = apiTokenInput.trim() === "" && existing ? existing.apiToken : apiTokenInput;
      if (!apiToken) {
        vscode.window.showErrorMessage("API token is required for first-time setup.");
        return;
      }

      const projectKey = await vscode.window.showInputBox({
        title: "Default Project Key" + (existing ? " (leave unchanged to keep current)" : ""),
        prompt: "e.g. PROJ",
        value: existing?.projectKey ?? "",
        ignoreFocusOut: true,
      });
      if (projectKey === undefined) return;
      if (!projectKey.trim()) {
        vscode.window.showErrorMessage("Project key is required.");
        return;
      }

      await credProvider.storeCredentials({
        baseUrl: trimmedUrl,
        email: email.trim(),
        apiToken,
        projectKey: projectKey.trim(),
      });

      vscode.window.showInformationMessage("SpecPilot: Jira credentials saved.");
      onCredentialsChanged();
    })
  );
}
