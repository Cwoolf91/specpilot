import React, { useState, useCallback, useRef } from "react";
import Input from "../../components/shared/Input";
import Button from "../../components/shared/Button";
import Spinner from "../../components/shared/Spinner";
import { useVsCodeMessage, sendMessage } from "../../hooks/useVsCodeMessage";

interface Screenshot { route: string; path: string }
interface StoryInfo { key: string; summary: string; description: string; hasAttachments: boolean; attachmentCount: number }
interface Mapping { storyKey: string; storySummary: string; screenshotPaths: string[] }

export default function AugmentTab() {
  const [epicKey, setEpicKey] = useState("");
  const [vibeRepo, setVibeRepo] = useState("");
  const [vibeBranch, setVibeBranch] = useState("dev");
  const [routesInput, setRoutesInput] = useState("");
  const [phase, setPhase] = useState<"input" | "loading-stories" | "capturing" | "matching" | "done">("input");
  const [stories, setStories] = useState<StoryInfo[]>([]);
  const storiesRef = useRef<StoryInfo[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [mapping, setMapping] = useState<Mapping[]>([]);
  const [progressMessage, setProgressMessage] = useState("");

  const handleMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    switch (msg.type) {
      case "epicStoriesResult": {
        const fetchedStories = msg.stories as StoryInfo[];
        setStories(fetchedStories);
        storiesRef.current = fetchedStories;
        // Now trigger screenshot capture
        const routes = routesInput
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);
        setPhase("capturing");
        sendMessage("captureScreenshots", {
          vibeRepo,
          vibeBranch,
          appDir: ".",
          routes,
        });
        break;
      }
      case "screenshotsResult":
        setScreenshots(msg.screenshots as Screenshot[]);
        setPhase("matching");
        // Trigger matching with the fetched stories (use ref to avoid stale closure)
        sendMessage("matchScreenshots", {
          stories: storiesRef.current,
          screenshots: msg.screenshots,
        });
        break;
      case "matchResult":
        setMapping(msg.mapping as Mapping[]);
        setPhase("done");
        break;
      case "progress":
        setProgressMessage(msg.message as string);
        break;
      case "folderSelected":
        if (!vibeRepo) setVibeRepo(msg.path as string);
        break;
      case "error":
        setPhase("input");
        break;
    }
  }, [vibeRepo, vibeBranch, routesInput]);

  useVsCodeMessage(handleMessage);

  const handleCapture = () => {
    setPhase("loading-stories");
    sendMessage("getEpicStories", { epicKey });
  };

  const handleReset = () => {
    setPhase("input");
    setStories([]);
    setScreenshots([]);
    setMapping([]);
    setProgressMessage("");
  };

  return (
    <div className="augment-tab">
      <h2>Augment Epic</h2>
      <p className="description">
        Add screenshots to an existing epic's stories. Provide the epic key,
        capture screenshots, and they'll be matched to relevant stories.
      </p>

      {phase === "input" && (
        <div className="augment-form">
          <Input
            label="Epic Key"
            value={epicKey}
            onChange={(e) => setEpicKey(e.target.value)}
            placeholder="PROJ-123"
          />
          <div className="input-with-browse">
            <Input
              label="Vibe Repo Path"
              value={vibeRepo}
              onChange={(e) => setVibeRepo(e.target.value)}
              placeholder="/path/to/vibe-code-repo"
            />
            <Button
              variant="secondary"
              onClick={() => sendMessage("browseFolder")}
            >
              Browse
            </Button>
          </div>
          <Input
            label="Branch"
            value={vibeBranch}
            onChange={(e) => setVibeBranch(e.target.value)}
            placeholder="dev"
          />
          <Input
            label="Routes (comma-separated, leave blank for auto-detect)"
            value={routesInput}
            onChange={(e) => setRoutesInput(e.target.value)}
            placeholder="/search, /dashboard"
          />
          <div className="step-nav">
            <Button
              onClick={handleCapture}
              disabled={!epicKey || !vibeRepo}
            >
              Capture & Match Screenshots
            </Button>
          </div>
        </div>
      )}

      {phase === "loading-stories" && (
        <Spinner text="Loading epic stories..." />
      )}

      {phase === "capturing" && (
        <Spinner text={progressMessage || "Capturing screenshots..."} />
      )}

      {phase === "matching" && (
        <div>
          <h4>{screenshots.length} screenshots captured</h4>
          <Spinner text="Matching screenshots to stories..." />
        </div>
      )}

      {phase === "done" && (
        <div className="augment-results">
          <h4>Screenshot Mapping</h4>
          {mapping.length === 0 ? (
            <p className="muted">No mappings generated.</p>
          ) : (
            <table className="tickets-table">
              <thead>
                <tr>
                  <th>Story</th>
                  <th>Screenshots</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((m, i) => (
                  <tr key={i}>
                    <td>{m.storyKey}</td>
                    <td>{m.screenshotPaths.length} file(s)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="step-nav">
            <Button onClick={handleReset}>Start Over</Button>
          </div>
        </div>
      )}
    </div>
  );
}
