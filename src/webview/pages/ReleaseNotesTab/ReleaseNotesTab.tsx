import React, { useState, useCallback, useEffect, useMemo } from "react";
import Button from "../../components/shared/Button";
import Select from "../../components/shared/Select";
import Spinner from "../../components/shared/Spinner";
import { useVsCodeMessage, sendMessage } from "../../hooks/useVsCodeMessage";

interface JiraVersion {
  id: string;
  name: string;
  released?: boolean;
}

interface IssuePreview {
  key: string;
  summary: string;
  type: string;
  status: string;
}

interface ReleaseNotesResult {
  summary: string;
  categories: Array<{ name: string; items: Array<{ key: string; summary: string }> }>;
}

export default function ReleaseNotesTab() {
  // Step 0: Version & Filter
  const [versions, setVersions] = useState<JiraVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [showReleased, setShowReleased] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [versionIssues, setVersionIssues] = useState<IssuePreview[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  // Step 1: Issue Selection
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [sprintIssues, setSprintIssues] = useState<IssuePreview[]>([]);
  const [selectedSprintKeys, setSelectedSprintKeys] = useState<Set<string>>(new Set());
  const [loadingSprintIssues, setLoadingSprintIssues] = useState(false);
  const [sprintLoaded, setSprintLoaded] = useState(false);

  // Step 2: Generate & Preview
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState<ReleaseNotesResult | null>(null);
  const [plainText, setPlainText] = useState("");
  const [notesJson, setNotesJson] = useState("");
  const [notesError, setNotesError] = useState("");

  // Step 3: Publish
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<string[]>([]);

  // Shared
  const [step, setStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  // Fetch versions on mount
  useEffect(() => {
    sendMessage("getVersions");
  }, []);

  const handleMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    switch (msg.type) {
      case "versionsResult":
        setVersions(msg.versions as JiraVersion[]);
        setLoadingVersions(false);
        break;
      case "issuesResult": {
        const issues = msg.issues as IssuePreview[];
        setVersionIssues(issues);
        setLoadingIssues(false);
        setExcludedKeys(new Set());
        break;
      }
      case "sprintIssuesResult":
        setSprintIssues(msg.issues as IssuePreview[]);
        setLoadingSprintIssues(false);
        setSprintLoaded(true);
        break;
      case "releaseNotesGenerated":
        setNotes(msg.notes as ReleaseNotesResult);
        setPlainText(msg.plainText as string);
        setGenerating(false);
        setStep(2);
        break;
      case "releaseNotesResult":
        setNotes(msg.notes as ReleaseNotesResult);
        setPlainText(msg.plainText as string);
        setStep(2);
        break;
      case "releaseNotesError":
        setGenerating(false);
        setErrorMessage(msg.message as string);
        break;
      case "publishResult":
        setPublishResults(msg.results as string[]);
        setPublishing(false);
        break;
      case "error":
        setLoadingVersions(false);
        setLoadingIssues(false);
        setLoadingSprintIssues(false);
        setGenerating(false);
        setPublishing(false);
        setErrorMessage(msg.message as string);
        break;
    }
  }, []);

  useVsCodeMessage(handleMessage);

  // Derived: available statuses from version issues
  const availableStatuses = useMemo(() => {
    const statuses = [...new Set(versionIssues.map((i) => i.status).filter(Boolean))];
    return statuses.sort();
  }, [versionIssues]);

  // Derived: filtered version issues
  const filteredVersionIssues = useMemo(() => {
    if (!statusFilter) return versionIssues;
    return versionIssues.filter((i) => i.status === statusFilter);
  }, [versionIssues, statusFilter]);

  // Derived: sprint issues not already in version list
  const versionIssueKeys = useMemo(
    () => new Set(versionIssues.map((i) => i.key)),
    [versionIssues]
  );
  const availableSprintIssues = useMemo(
    () => sprintIssues.filter((i) => !versionIssueKeys.has(i.key)),
    [sprintIssues, versionIssueKeys]
  );

  // Derived: merged selected issues for generation
  const selectedIssues = useMemo(() => {
    const fromVersion = filteredVersionIssues.filter((i) => !excludedKeys.has(i.key));
    const fromSprint = availableSprintIssues.filter((i) => selectedSprintKeys.has(i.key));
    return [...fromVersion, ...fromSprint];
  }, [filteredVersionIssues, excludedKeys, availableSprintIssues, selectedSprintKeys]);

  // Sorted versions for dropdown
  const sortedVersions = useMemo(() => {
    return versions
      .filter((v) => showReleased || !v.released)
      .sort((a, b) => b.name.localeCompare(a.name));
  }, [versions, showReleased]);

  const handleVersionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedVersion(name);
    setErrorMessage("");
    setStatusFilter("");
    setVersionIssues([]);
    setSprintIssues([]);
    setSprintLoaded(false);
    setSelectedSprintKeys(new Set());
    setNotes(null);
    setPlainText("");
    setPublishResults([]);
    if (name) {
      setLoadingIssues(true);
      sendMessage("searchIssues", { versionName: name });
    }
  };

  const handleLoadSprintIssues = () => {
    setLoadingSprintIssues(true);
    setSelectedSprintKeys(new Set());
    sendMessage("getSprintIssues");
  };

  const toggleExclude = (key: string) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSprintSelect = (key: string) => {
    setSelectedSprintKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleGenerate = () => {
    setGenerating(true);
    setErrorMessage("");
    sendMessage("generateReleaseNotes", {
      issues: selectedIssues.map((i) => ({ key: i.key, summary: i.summary, type: i.type })),
      versionName: selectedVersion,
    });
  };

  const handleImportNotes = () => {
    try {
      const parsed = JSON.parse(notesJson);
      setNotesError("");
      sendMessage("importReleaseNotes", { notes: parsed, versionName: selectedVersion });
    } catch {
      setNotesError("Invalid JSON. Paste the ReleaseNotesResult object.");
    }
  };

  const handlePublish = () => {
    setPublishing(true);
    setErrorMessage("");
    sendMessage("publishReleaseNotes", { versionName: selectedVersion, notes, plainText });
  };

  const stepLabels = ["Version & Filter", "Select Issues", "Generate & Preview", "Publish"];

  return (
    <div className="release-notes-tab">
      <h2>Release Notes</h2>
      <p className="description">
        Select a version, filter issues, generate AI-powered release notes, and publish to Confluence & Jira.
      </p>

      {/* Step indicators */}
      <div className="step-indicators">
        {stepLabels.map((label, i) => (
          <div
            key={i}
            className={`step-indicator ${
              i === step ? "step-current" : i < step ? "step-done" : "step-pending"
            }`}
          >
            <span className="step-number">{i < step ? "\u2713" : i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      {errorMessage && <p className="error-text">{errorMessage}</p>}

      {/* Step 0: Version & Filter */}
      {step === 0 && (
        <div className="step-content">
          {loadingVersions ? (
            <Spinner text="Loading versions..." />
          ) : (
            <>
              <div className="filter-row">
                <Select
                  label="Version"
                  options={[
                    { value: "", label: "Select a version..." },
                    ...sortedVersions.map((v) => ({
                      value: v.name,
                      label: `${v.name}${v.released ? " (released)" : ""}`,
                    })),
                  ]}
                  value={selectedVersion}
                  onChange={handleVersionChange}
                />
                {availableStatuses.length > 0 && (
                  <Select
                    label="Status Filter"
                    options={[
                      { value: "", label: "All statuses" },
                      ...availableStatuses.map((s) => ({ value: s, label: s })),
                    ]}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  />
                )}
              </div>

              <div className="show-released-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={showReleased}
                    onChange={(e) => setShowReleased(e.target.checked)}
                  />
                  Show released versions
                </label>
              </div>

              {loadingIssues && <Spinner text="Searching issues..." />}

              {!loadingIssues && versionIssues.length > 0 && (
                <div className="issues-preview">
                  <h4>
                    {filteredVersionIssues.length} issue{filteredVersionIssues.length !== 1 ? "s" : ""}{" "}
                    {statusFilter ? `with status "${statusFilter}"` : `in ${selectedVersion}`}
                  </h4>
                </div>
              )}

              {!loadingIssues && selectedVersion && versionIssues.length === 0 && (
                <p className="muted">No issues found for this version.</p>
              )}

              <div className="step-nav">
                <Button
                  onClick={() => setStep(1)}
                  disabled={filteredVersionIssues.length === 0}
                >
                  Next: Select Issues
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 1: Issue Selection */}
      {step === 1 && (
        <div className="step-content">
          <div className="issue-picker-panels">
            <div className="issue-picker-panel">
              <h4>
                Version Issues ({filteredVersionIssues.filter((i) => !excludedKeys.has(i.key)).length} of{" "}
                {filteredVersionIssues.length} selected)
              </h4>
              <ul className="issue-checkbox-list">
                {filteredVersionIssues.map((i) => (
                  <li key={i.key} className="issue-checkbox-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={!excludedKeys.has(i.key)}
                        onChange={() => toggleExclude(i.key)}
                      />
                      <span className="issue-key">{i.key}</span>
                      <span className="issue-type">[{i.type}]</span>
                      <span>{i.summary}</span>
                    </label>
                    <span className="issue-status">{i.status}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="issue-picker-panel">
              <h4>Sprint Issues ({selectedSprintKeys.size} selected)</h4>
              {!sprintLoaded ? (
                <div>
                  <p className="muted">Add additional issues from the active sprint.</p>
                  <Button onClick={handleLoadSprintIssues} disabled={loadingSprintIssues}>
                    {loadingSprintIssues ? "Loading..." : "Load Sprint Issues"}
                  </Button>
                </div>
              ) : availableSprintIssues.length === 0 ? (
                <p className="muted">No additional sprint issues available.</p>
              ) : (
                <ul className="issue-checkbox-list">
                  {availableSprintIssues.map((i) => (
                    <li key={i.key} className="issue-checkbox-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedSprintKeys.has(i.key)}
                          onChange={() => toggleSprintSelect(i.key)}
                        />
                        <span className="issue-key">{i.key}</span>
                        <span className="issue-type">[{i.type}]</span>
                        <span>{i.summary}</span>
                      </label>
                      <span className="issue-status">{i.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              {loadingSprintIssues && <Spinner text="Loading sprint issues..." />}
            </div>
          </div>

          <p className="generation-summary">
            <strong>{selectedIssues.length}</strong> issue{selectedIssues.length !== 1 ? "s" : ""} selected
            for release notes.
          </p>

          <div className="step-nav">
            <Button className="btn-secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={() => setStep(2)} disabled={selectedIssues.length === 0}>
              Next: Generate Notes
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Generate & Preview */}
      {step === 2 && (
        <div className="step-content">
          {!notes ? (
            <>
              <p>
                <strong>{selectedIssues.length}</strong> issues ready for release notes generation.
              </p>

              <div className="step-nav">
                <Button onClick={handleGenerate} disabled={generating || selectedIssues.length === 0}>
                  {generating ? "Generating..." : "Generate Release Notes"}
                </Button>
              </div>

              {generating && <Spinner text="Generating release notes with AI..." />}

              <details className="manual-import-toggle">
                <summary>Manual Import (paste JSON)</summary>
                <textarea
                  className="analysis-textarea"
                  rows={8}
                  value={notesJson}
                  onChange={(e) => setNotesJson(e.target.value)}
                  placeholder={'{\n  "summary": "...",\n  "categories": [...]\n}'}
                />
                {notesError && <p className="error-text">{notesError}</p>}
                <Button onClick={handleImportNotes} disabled={!notesJson.trim()}>
                  Import Notes
                </Button>
              </details>
            </>
          ) : (
            <>
              <h4>Preview</h4>
              <textarea
                className="notes-edit-textarea"
                value={plainText}
                onChange={(e) => setPlainText(e.target.value)}
                rows={16}
              />

              <details className="manual-import-toggle">
                <summary>Raw JSON</summary>
                <pre className="notes-text">{JSON.stringify(notes, null, 2)}</pre>
              </details>

              <div className="step-nav">
                <Button className="btn-secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  className="btn-secondary"
                  onClick={() => {
                    setNotes(null);
                    setPlainText("");
                  }}
                >
                  Regenerate
                </Button>
                <Button onClick={() => setStep(3)}>Next: Publish</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Publish */}
      {step === 3 && (
        <div className="step-content">
          <h4>Publish Release Notes</h4>
          <p className="description">
            Publish to Confluence and update the Jira version description for{" "}
            <strong>{selectedVersion}</strong>.
          </p>

          <div className="notes-preview">
            <pre className="notes-text">{plainText}</pre>
          </div>

          <div className="publish-actions">
            <Button onClick={handlePublish} disabled={publishing || !notes}>
              {publishing ? "Publishing..." : "Publish to Confluence & Jira"}
            </Button>
          </div>

          {publishing && <Spinner text="Publishing..." />}

          {publishResults.length > 0 && (
            <div className="publish-results">
              <h4>Results</h4>
              <ul>
                {publishResults.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="step-nav">
            <Button className="btn-secondary" onClick={() => setStep(2)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
