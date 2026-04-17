import * as vscode from "vscode";
import type { VscodeCredentialProvider } from "../credentials.js";

export function registerSetAnthropicApiKey(
  context: vscode.ExtensionContext,
  credProvider: VscodeCredentialProvider,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand("specPilot.setAnthropicApiKey", async () => {
      const apiKey = await vscode.window.showInputBox({
        title: "Anthropic API Key",
        prompt:
          "Enter your Anthropic API key. Get one at https://console.anthropic.com/settings/keys",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value.trim()) return "API key is required";
          if (!value.startsWith("sk-"))
            return "Anthropic API keys start with 'sk-'";
          return null;
        },
      });
      if (!apiKey) return;

      await credProvider.storeAnthropicApiKey(apiKey.trim());
      vscode.window.showInformationMessage(
        "SpecPilot: Anthropic API key saved. AI features will use the Anthropic API.",
      );
    }),
  );
}
