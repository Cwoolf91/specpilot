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

interface TemplateInfo {
  kind: "story" | "epic";
  configuredPath: string;
  resolvedPath: string | null;
  usingCustom: boolean;
  exists: boolean;
  error: string | null;
}

interface TemplatesForm {
  story: TemplateInfo;
  epic: TemplateInfo;
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

  const [epicLabel, setEpicLabel] = useState<string>("");
  const [epicLabelDefault, setEpicLabelDefault] = useState<string>("vibe-code");
  const [epicLabelDraft, setEpicLabelDraft] = useState<string>("");
  const [editingEpicLabel, setEditingEpicLabel] = useState(false);
  const [savingEpicLabel, setSavingEpicLabel] = useState(false);

  const [templates, setTemplates] = useState<TemplatesForm | null>(null);

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
        case "epicLabel": {
          const value = (msg.value as string) || "vibe-code";
          const defaultValue = (msg.defaultValue as string) || "vibe-code";
          setEpicLabel(value);
          setEpicLabelDefault(defaultValue);
          setEpicLabelDraft(value);
          break;
        }
        case "templatesForm":
          setTemplates(msg.form as TemplatesForm);
          break;
        case "templatePathSaved":
          showToast({
            kind: "success",
            text: `${msg.kind === "story" ? "Story" : "Epic"} template set to ${msg.stored as string}.`,
          });
          break;
        case "templatePathCleared":
          showToast({
            kind: "success",
            text: `${msg.kind === "story" ? "Story" : "Epic"} template reset to built-in.`,
          });
          break;
        case "templateScaffolded":
          showToast({
            kind: "success",
            text: `Scaffolded ${msg.kind === "story" ? "story" : "epic"} template.`,
          });
          break;
        case "epicLabelSaved": {
          const value = (msg.value as string) || "vibe-code";
          setEpicLabel(value);
          setEpicLabelDraft(value);
          setSavingEpicLabel(false);
          setEditingEpicLabel(false);
          showToast({
            kind: "success",
            text: `Vibe Code epic label saved as "${value}".`,
          });
          break;
        }
        case "error": {
          // Only surface errors tied to requests this tab originated,
          // otherwise we'd show errors from Vibe Code / Release Notes tabs
          // and reset our saving flags for unrelated failures.
          const requestType = msg.requestType;
          const SETTINGS_REQUESTS = new Set([
            "getConnectionStatus",
            "getAboutInfo",
            "getCredentialsForm",
            "saveCredentialsForm",
            "saveAnthropicKeyForm",
            "getEpicLabel",
            "saveEpicLabel",
            "openExternal",
            "getTemplatesForm",
            "browseTemplate",
            "scaffoldTemplate",
            "clearTemplatePath",
            "viewTemplate",
          ]);
          if (typeof requestType === "string" && !SETTINGS_REQUESTS.has(requestType)) {
            break;
          }
          if (requestType === "saveCredentialsForm") setSaving(false);
          else if (requestType === "saveAnthropicKeyForm") setSavingAnthropic(false);
          else if (requestType === "saveEpicLabel") setSavingEpicLabel(false);
          showToast({
            kind: "error",
            text: (msg.message as string) || "Something went wrong.",
          });
          break;
        }
      }
    },
    []
  );

  useVsCodeMessage(handleMessage);

  useEffect(() => {
    sendMessage("getConnectionStatus");
    sendMessage("getAboutInfo");
    sendMessage("getCredentialsForm");
    sendMessage("getEpicLabel");
    sendMessage("getTemplatesForm");
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

  const handleSaveEpicLabel = () => {
    const trimmed = epicLabelDraft.trim();
    if (!trimmed) {
      showToast({ kind: "error", text: "Epic label cannot be empty." });
      return;
    }
    if (!/^[\w.-]+$/.test(trimmed)) {
      showToast({
        kind: "error",
        text: "Label may only contain letters, numbers, hyphens, underscores, and dots.",
      });
      return;
    }
    setSavingEpicLabel(true);
    sendMessage("saveEpicLabel", { value: trimmed });
  };

  const handleResetEpicLabel = () => {
    setEpicLabelDraft(epicLabelDefault);
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
        <h3>Vibe Code Epic Label</h3>
        <p className="description">
          Label applied to epics created by SpecPilot, and used to filter the
          "Vibe Code Epics" sidebar view. Change this if your team already uses a
          different convention (e.g. <code>product-spike</code> or <code>prototype</code>).
        </p>
        {epicLabel ? (
          <div className="credentials-form">
            <Input
              label="Label"
              value={editingEpicLabel ? epicLabelDraft : epicLabel}
              onChange={(e) => setEpicLabelDraft(e.target.value)}
              placeholder={epicLabelDefault}
              disabled={!editingEpicLabel}
            />
            <div className="settings-actions">
              {editingEpicLabel ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEpicLabelDraft(epicLabel);
                      setEditingEpicLabel(false);
                    }}
                    disabled={savingEpicLabel}
                  >
                    Cancel
                  </Button>
                  {epicLabelDraft !== epicLabelDefault && (
                    <Button
                      variant="secondary"
                      onClick={handleResetEpicLabel}
                      disabled={savingEpicLabel}
                    >
                      Reset to default
                    </Button>
                  )}
                  <Button
                    onClick={handleSaveEpicLabel}
                    disabled={savingEpicLabel || epicLabelDraft.trim() === epicLabel.trim()}
                  >
                    {savingEpicLabel ? "Saving..." : "Save Label"}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setEditingEpicLabel(true)}>
                  Edit Label
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Spinner text="Loading label..." />
        )}
      </div>

      <div className="settings-section">
        <h3>BDD Templates</h3>
        <p className="description">
          Customize the story and epic templates used by the AI when enhancing
          issues, generating analyses, and breaking down epics. Leave as built-in
          to use SpecPilot's defaults. Custom templates must live inside a
          workspace folder (<code>.md</code>, <code>.txt</code>, or{" "}
          <code>.template</code>).
        </p>
        {templates ? (
          <div className="credentials-form">
            {(["story", "epic"] as const).map((kind) => {
              const info = templates[kind];
              const label = kind === "story" ? "Story Template" : "Epic Template";
              return (
                <div key={kind} className="connection-card" style={{ marginBottom: 8 }}>
                  <div className="connection-row">
                    <span className="connection-label">{label}</span>
                    <StatusBadge
                      status={info.usingCustom ? "success" : "warning"}
                      label={info.usingCustom ? "Custom" : "Built-in"}
                    />
                  </div>
                  {info.configuredPath && (
                    <div className="connection-row">
                      <span className="connection-label">Path</span>
                      <span>
                        <code>{info.configuredPath}</code>
                      </span>
                    </div>
                  )}
                  {info.error && (
                    <div className="connection-row">
                      <span className="connection-label">Error</span>
                      <span className="error-text">{info.error}</span>
                    </div>
                  )}
                  <div className="settings-actions">
                    <Button
                      variant="secondary"
                      onClick={() => sendMessage("browseTemplate", { kind })}
                    >
                      Browse...
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => sendMessage("scaffoldTemplate", { kind })}
                    >
                      Scaffold default
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => sendMessage("viewTemplate", { kind })}
                    >
                      View
                    </Button>
                    {info.configuredPath && (
                      <Button
                        variant="secondary"
                        onClick={() => sendMessage("clearTemplatePath", { kind })}
                      >
                        Reset to built-in
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Spinner text="Loading templates..." />
        )}
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
