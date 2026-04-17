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

export default function SettingsTab() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [about, setAbout] = useState<AboutInfo | null>(null);

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
      }
    },
    []
  );

  useVsCodeMessage(handleMessage);

  useEffect(() => {
    sendMessage("getConnectionStatus");
    sendMessage("getAboutInfo");
  }, []);

  const openLink = (url: string) => sendMessage("openExternal", { url });

  const handleTestConnection = () => {
    setLoading(true);
    sendMessage("getConnectionStatus");
  };

  return (
    <div className="settings-tab">
      <h2>Settings</h2>
      <p className="description">
        Manage your Jira connection, API keys, and extension configuration.
      </p>

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
                <div className="connection-row">
                  <span className="connection-label">Instance</span>
                  <span>{status.baseUrl}</span>
                </div>
                <div className="connection-row">
                  <span className="connection-label">Project</span>
                  <span>{status.projectKey}</span>
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
              <Button
                onClick={() => sendMessage("openCommand", { command: "specPilot.setCredentials" })}
              >
                {status.connected ? "Update Credentials" : "Set Credentials"}
              </Button>
            </div>
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
