import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";

export function registerSetCredentials(
  context: vscode.ExtensionContext,
  credProvider: VscodeCredentialProvider,
  onCredentialsChanged: () => void
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("specPilot.setCredentials", async () => {
      const baseUrl = await vscode.window.showInputBox({
        title: "Jira Base URL",
        prompt: "e.g. https://yoursite.atlassian.net",
        value: "",
        ignoreFocusOut: true,
      });
      if (!baseUrl) return;

      const trimmedUrl = baseUrl.trim().replace(/\/+$/, "");
      if (!/^https:\/\/.+/.test(trimmedUrl)) {
        vscode.window.showErrorMessage("Jira Base URL must use HTTPS (e.g., https://yoursite.atlassian.net).");
        return;
      }

      const email = await vscode.window.showInputBox({
        title: "Jira Email",
        prompt: "Your Atlassian account email",
        ignoreFocusOut: true,
      });
      if (!email) return;

      const apiToken = await vscode.window.showInputBox({
        title: "Jira API Token",
        prompt: "Create at https://id.atlassian.net/manage-profile/security/api-tokens",
        password: true,
        ignoreFocusOut: true,
      });
      if (!apiToken) return;

      const projectKey = await vscode.window.showInputBox({
        title: "Default Project Key",
        prompt: "e.g. PROJ",
        value: "",
        ignoreFocusOut: true,
      });
      if (!projectKey) return;

      await credProvider.storeCredentials({
        baseUrl: trimmedUrl,
        email,
        apiToken,
        projectKey,
      });

      vscode.window.showInformationMessage("SpecPilot: Jira credentials saved.");
      onCredentialsChanged();
    })
  );
}
