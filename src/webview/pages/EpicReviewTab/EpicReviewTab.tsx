import React, { useState, useCallback, useEffect, useRef } from "react";
import Button from "../../components/shared/Button";
import Input from "../../components/shared/Input";
import Spinner from "../../components/shared/Spinner";
import EpicEditor from "../VibeCodeTab/steps/EpicEditor";
import { useVsCodeMessage, sendMessage } from "../../hooks/useVsCodeMessage";

interface StoryInfo {
  key: string;
  summary: string;
  description: string;
  hasAttachments: boolean;
  attachmentCount: number;
}

interface EpicDetails {
  key: string;
  summary: string;
  description: string;
  status: string;
  labels: string[];
  stories: StoryInfo[];
}

interface Story {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependsOn?: number[];
}

interface Epic {
  title: string;
  description: string;
  stories: Story[];
}

type Phase = "input" | "loading" | "review" | "generating" | "editing" | "done";

export default function EpicReviewTab() {
  const [phase, setPhase] = useState<Phase>("input");
  const [epicKey, setEpicKey] = useState("");
  const [epicDetails, setEpicDetails] = useState<EpicDetails | null>(null);
  const [focusArea, setFocusArea] = useState("");
  const [epics, setEpics] = useState<Epic[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [createdKeys, setCreatedKeys] = useState<string[]>([]);
  const [dryRunFile, setDryRunFile] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [savedStateAvailable, setSavedStateAvailable] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Persist state to globalState
  const saveState = useCallback((
    details: EpicDetails | null,
    currentEpics: Epic[],
    currentFocusArea: string,
    currentDryRun: boolean,
    currentPhase: Phase,
  ) => {
    if (!details) return;
    sendMessage("saveSettings", {
      key: "lastEpicReview",
      value: JSON.stringify({
        epicDetails: details,
        epics: currentEpics,
        focusArea: currentFocusArea,
        dryRun: currentDryRun,
        phase: currentPhase,
        timestamp: Date.now(),
      }),
    });
  }, []);

  // Load saved state on mount
  useEffect(() => {
    sendMessage("getSettings", { keys: ["lastEpicReview"] });
  }, []);

  // Auto-save when epics change (debounced)
  useEffect(() => {
    if (phase !== "editing" || epics.length === 0) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState(epicDetails, epics, focusArea, dryRun, phase);
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [epics, phase, epicDetails, focusArea, dryRun, saveState]);

  const handleMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    switch (msg.type) {
      case "epicDetailsResult": {
        const epic = msg.epic as EpicDetails;
        setEpicDetails(epic);
        setPhase("review");
        saveState(epic, [], focusArea, dryRun, "review");
        break;
      }
      case "epicStoryGenResult": {
        const analysis = msg.analysis as { epics: Epic[] };
        const newEpics = analysis.epics || [];
        setEpics(newEpics);
        setPhase("editing");
        saveState(epicDetails, newEpics, focusArea, dryRun, "editing");
        break;
      }
      case "storiesCreated": {
        const keys = msg.keys as string[];
        setCreatedKeys(keys);
        setDryRunFile((msg.dryRunFile as string) || "");
        setPhase("done");
        break;
      }
      case "settingsResult": {
        const settings = msg.settings as Record<string, string>;
        if (settings.lastEpicReview) {
          try {
            const saved = JSON.parse(settings.lastEpicReview);
            if (saved.epicDetails && (saved.phase === "review" || saved.phase === "editing")) {
              setSavedStateAvailable(true);
            }
          } catch { /* ignore */ }
        }
        break;
      }
      case "progress":
        setProgressMessage(msg.message as string);
        break;
      case "error":
        setErrorMessage(msg.message as string || "An error occurred");
        if (phase === "loading") setPhase("input");
        if (phase === "generating") setPhase("review");
        break;
    }
  }, [phase, epicDetails, focusArea, dryRun, saveState]);

  useVsCodeMessage(handleMessage);

  const handleFetchEpic = () => {
    setPhase("loading");
    setErrorMessage("");
    sendMessage("getEpicDetails", { epicKey: epicKey.trim().toUpperCase() });
  };

  const handleGenerateStories = () => {
    if (!epicDetails) return;
    setPhase("generating");
    setErrorMessage("");
    sendMessage("generateEpicStories", {
      epicKey: epicDetails.key,
      epicSummary: epicDetails.summary,
      epicDescription: epicDetails.description,
      existingStories: epicDetails.stories.map((s) => ({
        key: s.key,
        summary: s.summary,
        description: s.description,
      })),
      focusArea,
    });
  };

  const handleCreateStories = () => {
    if (!epicDetails || epics.length === 0) return;
    const stories = epics.flatMap((e) =>
      e.stories.map((s) => ({
        title: s.title,
        description: s.description,
        acceptanceCriteria: s.acceptanceCriteria,
        sourceFiles: [] as string[],
        screenshotRoutes: [] as string[],
        dependsOn: s.dependsOn ?? [],
      }))
    );
    setPhase("done");
    setCreatedKeys([]);
    setProgressMessage("Creating stories...");
    sendMessage("createStoriesForEpic", {
      epicKey: epicDetails.key,
      stories,
      dryRun,
    });
  };

  const handleResume = () => {
    sendMessage("getSettings", { keys: ["lastEpicReview"] });
    // Use a one-time listener approach — set a flag so the next settingsResult restores
    setPhase("loading");
    setProgressMessage("Restoring previous session...");
    const restore = (msg: { type: string; [key: string]: unknown }) => {
      if (msg.type !== "settingsResult") return;
      const settings = msg.settings as Record<string, string>;
      if (settings.lastEpicReview) {
        try {
          const saved = JSON.parse(settings.lastEpicReview);
          if (saved.epicDetails) {
            setEpicDetails(saved.epicDetails);
            setEpicKey(saved.epicDetails.key);
            setFocusArea(saved.focusArea || "");
            setDryRun(saved.dryRun ?? true);
            if (saved.epics?.length > 0) {
              setEpics(saved.epics);
              setPhase("editing");
            } else {
              setPhase("review");
            }
          } else {
            setPhase("input");
          }
        } catch {
          setPhase("input");
        }
      } else {
        setPhase("input");
      }
      setSavedStateAvailable(false);
      setProgressMessage("");
    };
    // Listen for the next settingsResult
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "settingsResult") {
        restore(msg);
        window.removeEventListener("message", handler);
      }
    };
    window.addEventListener("message", handler);
  };

  const handleReset = () => {
    setPhase("input");
    setEpicKey("");
    setEpicDetails(null);
    setFocusArea("");
    setEpics([]);
    setDryRun(true);
    setCreatedKeys([]);
    setProgressMessage("");
    setErrorMessage("");
    setSavedStateAvailable(false);
    sendMessage("saveSettings", { key: "lastEpicReview", value: "" });
  };

  return (
    <div className="epic-review-tab">
      <h2>Epic Review</h2>
      <p className="description">
        Look up an existing Jira epic, review its details, and generate stories with AI.
      </p>

      {errorMessage && <p className="error-text">{errorMessage}</p>}

      {/* Input Phase */}
      {phase === "input" && (
        <div className="step-content">
          {savedStateAvailable && (
            <div className="resume-banner">
              <p>You have a previous Epic Review session.</p>
              <div className="step-nav">
                <Button onClick={handleResume}>Resume Previous Session</Button>
                <Button variant="secondary" onClick={() => {
                  setSavedStateAvailable(false);
                  sendMessage("saveSettings", { key: "lastEpicReview", value: "" });
                }}>
                  Start Fresh
                </Button>
              </div>
            </div>
          )}
          <div className="input-with-browse">
            <Input
              label="Epic Key"
              value={epicKey}
              onChange={(e) => setEpicKey(e.target.value)}
              placeholder="e.g., PROJ-123"
            />
          </div>
          <div className="step-nav">
            <Button onClick={handleFetchEpic} disabled={!epicKey.trim()}>
              Fetch Epic
            </Button>
          </div>
        </div>
      )}

      {/* Loading Phase */}
      {phase === "loading" && <Spinner text="Fetching epic details..." />}

      {/* Review Phase */}
      {phase === "review" && epicDetails && (
        <div className="step-content">
          <div className="epic-detail-card">
            <h3>{epicDetails.key} — {epicDetails.summary}</h3>
            <p className="muted">Status: {epicDetails.status}</p>
            {epicDetails.description && (
              <div className="epic-description">
                <h4>Description</h4>
                <pre className="notes-text">{epicDetails.description}</pre>
              </div>
            )}
          </div>

          {epicDetails.stories.length > 0 && (
            <div className="existing-stories">
              <h4>Existing Stories ({epicDetails.stories.length})</h4>
              <ul className="issue-checkbox-list">
                {epicDetails.stories.map((s) => (
                  <li key={s.key} className="issue-checkbox-item">
                    <span className="issue-key">{s.key}</span>
                    <span>{s.summary}</span>
                    {s.attachmentCount > 0 && (
                      <span className="muted">({s.attachmentCount} attachments)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="input-group">
            <label>Focus Area (optional)</label>
            <textarea
              className="input"
              rows={3}
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value)}
              placeholder="e.g., Focus on the user-facing search functionality. Ignore backend/infrastructure stories."
            />
          </div>

          <div className="step-nav">
            <Button variant="secondary" onClick={handleReset}>
              Back
            </Button>
            <Button onClick={handleGenerateStories}>
              Generate Stories
            </Button>
          </div>
        </div>
      )}

      {/* Generating Phase */}
      {phase === "generating" && <Spinner text={progressMessage || "Generating stories with AI..."} />}

      {/* Editing Phase */}
      {phase === "editing" && (
        <div className="step-content">
          <p className="description">
            Generated stories for <strong>{epicDetails?.key}</strong>. Edit, add, or remove before creating.
          </p>
          <EpicEditor
            epics={epics}
            onChange={setEpics}
            onBack={() => setPhase("review")}
            onNext={handleCreateStories}
            nextLabel="Create Stories"
          />
          <div className="show-released-toggle">
            <label>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              Dry run (preview only, don't create tickets)
            </label>
          </div>
        </div>
      )}

      {/* Done Phase */}
      {phase === "done" && (
        <div className="step-content">
          {createdKeys.length > 0 ? (
            <>
              <h3>{dryRun ? "Dry Run — JSON Exported" : "Stories Created"}</h3>
              {dryRun && dryRunFile && (
                <p className="description">
                  Exported {createdKeys.length} stories as MCP-compatible JSON. The file has been opened in the editor.
                </p>
              )}
              {!dryRun && (
                <ul>
                  {createdKeys.map((key) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <Spinner text={progressMessage || "Creating stories..."} />
          )}
          <div className="step-nav">
            <Button variant="secondary" onClick={handleReset}>
              Start Over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
