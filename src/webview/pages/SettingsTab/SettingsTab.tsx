import React, { useState, useCallback, useEffect } from "react";
import Button from "../../components/shared/Button";
import Input from "../../components/shared/Input";
import StatusBadge from "../../components/shared/StatusBadge";
import Spinner from "../../components/shared/Spinner";
import { useVsCodeMessage, sendMessage } from "../../hooks/useVsCodeMessage";

interface ConnectionStatus {
  connected: boolean;
  displayName?: string;
  baseUrl?: string;
  projectKey?: string;
  error?: string;
}

interface AboutInfo {
  name: string;
  version: string;
  publisher: string;
  publisherId: string;
  license: string;
  homepage: string;
  repository: string;
  bugs: string;
  discord: string;
  marketplace: string;
}

interface CredentialsForm {
  baseUrl: string;
  email: string;
  projectKey: string;
  hasApiToken: boolean;
  hasAnthropicKey: boolean;
}

type Toast = { kind: "success" | "error"; text: string } | null;

export default function SettingsTab() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [about, setAbout] = useState<AboutInfo | null>(null);

  const [creds, setCreds] = useState<CredentialsForm | null>(null);
  const [editing, setEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingAnthropic, setEditingAnthropic] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [savingAnthropic, setSavingAnthropic] = useState(false);

  const [toast, setToast] = useState<Toast>(null);

  const showToast = (t: Toast) => {
    setToast(t);
    if (t) {
      setTimeout(() => setToast(null), 3500);
    }
  };

  const handleMessage = useCallback(
    (msg: { type: string; [key: string]: unknown }) => {
      switch (msg.type) {
        case "connectionStatus":
          setStatus(msg.status as ConnectionStatus);
          setLoading(false);
          break;
        case "aboutInfo":
          setAbout(msg.about as AboutInfo);
          break;
        case "credentialsForm": {
          const form = msg.form as CredentialsForm;
          setCreds(form);
          setBaseUrl(form.baseUrl);
          setEmail(form.email);
          setProjectKey(form.projectKey);
          setApiToken("");
          break;
        }
        case "credentialsSaved":
          setSaving(false);
          setEditing(false);
          setApiToken("");
          showToast({ kind: "success", text: "Jira credentials saved." });
          break;
        case "anthropicKeySaved":
          setSavingAnthropic(false);
          setEditingAnthropic(false);
          setAnthropicKey("");
          showToast({ kind: "success", text: "Anthropic API key saved." });
          break;
        case "error": {
          if (saving) setSaving(false);
          if (savingAnthropic) setSavingAnthropic(false);
          showToast({
            kind: "error",
            text: (msg.message as string) || "Something went wrong.",
          });
          break;
        }
      }
    },
    [saving, savingAnthropic]
  );

  useVsCodeMessage(handleMessage);

  useEffect(() => {
    sendMessage("getConnectionStatus");
    sendMessage("getAboutInfo");
    sendMessage("getCredentialsForm");
  }, []);

  const openLink = (url: string) => sendMessage("openExternal", { url });

  const handleTestConnection = () => {
    setLoading(true);
    sendMessage("getConnectionStatus");
  };

  const handleSaveCredentials = () => {
    if (!baseUrl.trim() || !email.trim() || !projectKey.trim()) {
      showToast({ kind: "error", text: "Base URL, email, and project key are required." });
      return;
    }
    if (!creds?.hasApiToken && !apiToken.trim()) {
      showToast({ kind: "error", text: "API token is required for first-time setup." });
      return;
    }
    setSaving(true);
    sendMessage("saveCredentialsForm", {
      baseUrl: baseUrl.trim(),
      email: email.trim(),
      projectKey: projectKey.trim(),
      apiToken: apiToken,
    });
  };

  const handleCancelEdit = () => {
    if (creds) {
      setBaseUrl(creds.baseUrl);
      setEmail(creds.email);
      setProjectKey(creds.projectKey);
    }
    setApiToken("");
    setEditing(false);
  };

  const handleSaveAnthropic = () => {
    if (!anthropicKey.trim()) {
      showToast({ kind: "error", text: "Anthropic API key is required." });
      return;
    }
    setSavingAnthropic(true);
    sendMessage("saveAnthropicKeyForm", { apiKey: anthropicKey.trim() });
  };

  return (
    <div className="settings-tab">
      <h2>Settings</h2>
      <p className="description">
        Manage your Jira connection, API keys, and extension configuration.
      </p>

      {toast && (
        <div className={`settings-toast toast-${toast.kind}`}>{toast.text}</div>
      )}

      <div className="settings-section">
        <h3>Connection</h3>
        {loading ? (
          <Spinner text="Checking connection..." />
        ) : status ? (
          <div className="connection-card">
            <div className="connection-row">
              <span className="connection-label">Status</span>
              <StatusBadge
                status={status.connected ? "success" : "error"}
                label={status.connected ? "Connected" : "Disconnected"}
              />
            </div>
            {status.connected && (
              <>
                <div className="connection-row">
                  <span className="connection-label">User</span>
                  <span>{status.displayName}</span>
                </div>
              </>
            )}
            {status.error && (
              <div className="connection-row">
                <span className="connection-label">Error</span>
                <span className="error-text">{status.error}</span>
              </div>
            )}
            <div className="settings-actions">
              <Button variant="secondary" onClick={handleTestConnection}>
                Test Connection
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="settings-section">
        <h3>Jira Credentials</h3>
        <p className="description">
          Edit any field individually — no more cascading prompts. Leave the API token
          blank to keep the existing one.
        </p>
        {creds ? (
          <div className="credentials-form">
            <Input
              label="Jira Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yoursite.atlassian.net"
              disabled={!editing}
            />
            <Input
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={!editing}
            />
            <Input
              label="Project Key"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
              placeholder="PROJ"
              disabled={!editing}
            />
            <Input
              label="API Token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                creds.hasApiToken
                  ? "••••••••  (leave blank to keep current)"
                  : "Paste your Jira API token"
              }
              disabled={!editing}
            />
            <div className="settings-actions">
              {editing ? (
                <>
                  <Button variant="secondary" onClick={handleCancelEdit} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveCredentials} disabled={saving}>
                    {saving ? "Saving..." : "Save Credentials"}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setEditing(true)}>
                  {creds.hasApiToken ? "Edit Credentials" : "Set Credentials"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Spinner text="Loading credentials..." />
        )}
      </div>

      <div className="settings-section">
        <h3>Anthropic API Key</h3>
        <p className="description">
          Used for AI issue enhancement, analysis, and release notes when Bedrock SSO
          isn't available. Falls back to the <code>ANTHROPIC_API_KEY</code> environment
          variable.
        </p>
        {creds ? (
          <div className="credentials-form">
            <div className="connection-row">
              <span className="connection-label">Status</span>
              <StatusBadge
                status={creds.hasAnthropicKey ? "success" : "warning"}
                label={creds.hasAnthropicKey ? "Configured" : "Not set"}
              />
            </div>
            {editingAnthropic ? (
              <>
                <Input
                  label="Anthropic API Key"
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
                <div className="settings-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingAnthropic(false);
                      setAnthropicKey("");
                    }}
                    disabled={savingAnthropic}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveAnthropic} disabled={savingAnthropic}>
                    {savingAnthropic ? "Saving..." : "Save Key"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="settings-actions">
                <Button onClick={() => setEditingAnthropic(true)}>
                  {creds.hasAnthropicKey ? "Replace Key" : "Set Key"}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="settings-section">
        <h3>MCP Server</h3>
        <p className="description">
          The MCP server exposes Jira operations as tools for Claude Code,
          Claude Desktop, or any MCP-compatible client.
        </p>
        <div className="settings-actions">
          <Button
            variant="secondary"
            onClick={() => sendMessage("openCommand", { command: "specPilot.startMcp" })}
          >
            Start MCP Server
          </Button>
          <Button
            variant="secondary"
            onClick={() => sendMessage("openCommand", { command: "specPilot.stopMcp" })}
          >
            Stop MCP Server
          </Button>
        </div>
        <div className="mcp-config-hint">
          <h4>Claude Code Setup</h4>
          <pre className="notes-text">{`// .claude/settings.json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-server.ts"],
      "cwd": "${typeof window !== "undefined" ? "/path/to/specpilot" : ""}"
    }
  }
}`}</pre>
        </div>
      </div>

      <div className="settings-section">
        <h3>About</h3>
        {about ? (
          <div className="about-info">
            <div className="connection-row">
              <span className="connection-label">Name</span>
              <span>{about.name}</span>
            </div>
            <div className="connection-row">
              <span className="connection-label">Version</span>
              <span>{about.version}</span>
            </div>
            <div className="connection-row">
              <span className="connection-label">Publisher</span>
              <span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    openLink(about.homepage);
                  }}
                >
                  {about.publisher}
                </a>
              </span>
            </div>
            <div className="connection-row">
              <span className="connection-label">License</span>
              <span>{about.license}</span>
            </div>
            <div className="about-links">
              <Button variant="secondary" onClick={() => openLink(about.marketplace)}>
                Marketplace
              </Button>
              <Button variant="secondary" onClick={() => openLink(about.repository)}>
                GitHub
              </Button>
              <Button variant="secondary" onClick={() => openLink(about.bugs)}>
                Report an Issue
              </Button>
              <Button variant="secondary" onClick={() => openLink(about.discord)}>
                Discord
              </Button>
            </div>
            <p className="about-tagline">
              Built by{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openLink(about.homepage);
                }}
              >
                {about.publisher}
              </a>
              . AI-powered Jira workflow inside VS Code.
            </p>
          </div>
        ) : (
          <Spinner text="Loading..." />
        )}
      </div>
    </div>
  );
}
