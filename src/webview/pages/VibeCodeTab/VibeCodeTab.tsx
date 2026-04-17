import React, { useState, useCallback, useEffect } from "react";
import StepWizard from "../../components/layout/StepWizard";
import RepoSelector from "./steps/RepoSelector";
import DiffReview from "./steps/DiffReview";
import EpicEditor from "./steps/EpicEditor";
import ScreenshotReview from "./steps/ScreenshotReview";
import SprintSelector from "./steps/SprintSelector";
import CreationProgress from "./steps/CreationProgress";
import Spinner from "../../components/shared/Spinner";
import { useVsCodeMessage, sendMessage } from "../../hooks/useVsCodeMessage";

const STEPS = [
  { label: "Repos" },
  { label: "Diff Review" },
  { label: "Epic Editor" },
  { label: "Screenshots" },
  { label: "Sprint" },
  { label: "Create" },
];

interface Epic {
  title: string;
  description: string;
  stories: { title: string; description: string; acceptanceCriteria: string[] }[];
}

interface Board { id: number; name: string }
interface Sprint { id: number; name: string; state: string }
interface Screenshot { route: string; path: string }
interface CreatedTicket { key: string; summary: string; type: string }

export default function VibeCodeTab() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [vibeRepo, setVibeRepo] = useState("");
  const [vibeBranch, setVibeBranch] = useState("dev");
  const [targetRepo, setTargetRepo] = useState("");
  const [targetBranch, setTargetBranch] = useState("origin/main");
  const [appDir, setAppDir] = useState(".");

  // Step 2
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [routes, setRoutes] = useState<string[]>([]);
  const [statSummary, setStatSummary] = useState("");
  const [analysisJson, setAnalysisJson] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [focusArea, setFocusArea] = useState("");

  // Step 3
  const [epics, setEpics] = useState<Epic[]>([]);

  // Step 4
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [skipScreenshots, setSkipScreenshots] = useState(false);

  // Step 5
  const [boards, setBoards] = useState<Board[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<number | null>(null);
  const [selectedSprint, setSelectedSprint] = useState<number | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(false);

  // Step 6
  const [creating, setCreating] = useState(false);
  const [tickets, setTickets] = useState<CreatedTicket[]>([]);
  const [progressMessage, setProgressMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Persistence
  const [savedAnalysisAvailable, setSavedAnalysisAvailable] = useState(false);
  const [savedDiffAvailable, setSavedDiffAvailable] = useState(false);

  const handleMessage = useCallback((msg: { type: string; [key: string]: unknown }) => {
    switch (msg.type) {
      case "diffResult": {
        const cats = msg.categories as Record<string, string[]>;
        const rts = msg.routes as string[];
        const diff = msg.diff as { statSummary?: string } | undefined;
        const stat = diff?.statSummary ?? "";
        setCategories(cats);
        setRoutes(rts);
        setStatSummary(stat);
        setLoading(false);
        setStep(1);
        sendMessage("saveSettings", {
          key: "lastDiffContext",
          value: { categories: cats, routes: rts, statSummary: stat, timestamp: Date.now() },
        });
        break;
      }
      case "analysisResult": {
        const analysis = msg.analysis as { epics: Epic[] };
        const newEpics = analysis.epics || [];
        setEpics(newEpics);
        setLoading(false);
        setStep(2);
        sendMessage("saveSettings", {
          key: "lastAnalysis",
          value: { epics: newEpics, timestamp: Date.now() },
        });
        break;
      }
      case "boardsResult":
        setBoards(msg.boards as Board[]);
        setLoadingBoards(false);
        break;
      case "sprintsResult":
        setSprints(msg.sprints as Sprint[]);
        break;
      case "screenshotsResult":
        setScreenshots(msg.screenshots as Screenshot[]);
        setCapturing(false);
        break;
      case "ticketsCreated": {
        const keys = msg.keys as string[] | undefined;
        setTickets((keys ?? []).map((key) => ({ key, summary: "", type: "" })));
        setCreating(false);
        break;
      }
      case "progress":
        setProgressMessage(msg.message as string);
        break;
      case "folderSelected":
        // Set to whichever field is currently empty or last focused
        if (!vibeRepo) setVibeRepo(msg.path as string);
        else if (!targetRepo) setTargetRepo(msg.path as string);
        break;
      case "settingsResult":
        if (msg.key === "vibeCodeSettings" && msg.value) {
          const saved = msg.value as Record<string, string>;
          if (saved.vibeRepo) setVibeRepo(saved.vibeRepo);
          if (saved.vibeBranch) setVibeBranch(saved.vibeBranch);
          if (saved.targetRepo) setTargetRepo(saved.targetRepo);
          if (saved.targetBranch) setTargetBranch(saved.targetBranch);
          if (saved.appDir !== undefined) setAppDir(saved.appDir);
        }
        if (msg.key === "lastDiffContext" && msg.value) {
          const saved = msg.value as { categories: Record<string, string[]>; routes: string[]; statSummary: string };
          if (saved.categories && Object.keys(saved.categories).length > 0) {
            setCategories(saved.categories);
            setRoutes(saved.routes || []);
            setStatSummary(saved.statSummary || "");
            setSavedDiffAvailable(true);
          }
        }
        if (msg.key === "lastAnalysis" && msg.value) {
          const saved = msg.value as { epics: Epic[] };
          if (saved.epics?.length > 0) {
            setEpics(saved.epics);
            setSavedAnalysisAvailable(true);
          }
        }
        break;
      case "error":
        setLoading(false);
        setCapturing(false);
        setCreating(false);
        setLoadingBoards(false);
        setErrorMessage(msg.message as string || "An unknown error occurred");
        break;
    }
  }, [vibeRepo, targetRepo]);

  useVsCodeMessage(handleMessage);

  // Load saved state on mount
  useEffect(() => {
    sendMessage("getSettings", { key: "vibeCodeSettings" });
    sendMessage("getSettings", { key: "lastDiffContext" });
    sendMessage("getSettings", { key: "lastAnalysis" });
  }, []);

  // Auto-save epics when edited (debounced)
  useEffect(() => {
    if (epics.length === 0) return;
    const timer = setTimeout(() => {
      sendMessage("saveSettings", {
        key: "lastAnalysis",
        value: { epics, timestamp: Date.now() },
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [epics]);

  const handleFieldChange = (field: string, value: string) => {
    const setters: Record<string, (v: string) => void> = {
      vibeRepo: setVibeRepo,
      vibeBranch: setVibeBranch,
      targetRepo: setTargetRepo,
      targetBranch: setTargetBranch,
      appDir: setAppDir,
    };
    setters[field]?.(value);
  };

  const handleGenerateDiff = () => {
    setLoading(true);
    setErrorMessage("");
    // Persist repo settings for next session
    sendMessage("saveSettings", {
      key: "vibeCodeSettings",
      value: { vibeRepo, vibeBranch, targetRepo, targetBranch, appDir },
    });
    sendMessage("getDiff", { vibeRepo, vibeBranch, targetRepo, targetBranch, appDir });
  };

  const handleGenerateAnalysis = () => {
    setLoading(true);
    setErrorMessage("");
    sendMessage("generateAnalysis", { statSummary, categories, routes, focusArea });
  };

  const handleImportAnalysis = () => {
    try {
      const parsed = JSON.parse(analysisJson);
      setAnalysisError("");
      sendMessage("importAnalysis", { analysis: parsed });
      setLoading(true);
    } catch {
      setAnalysisError("Invalid JSON. Paste the analysis object with an \"epics\" array.");
    }
  };

  const handleCapture = () => {
    setCapturing(true);
    sendMessage("captureScreenshots", { vibeRepo, vibeBranch, appDir, routes });
  };

  const handleBoardChange = (id: number) => {
    setSelectedBoard(id);
    sendMessage("getSprints", { boardId: id });
  };

  const handleCreate = () => {
    setCreating(true);
    setStep(5);
    sendMessage("createTickets", {
      analysis: {
        epics,
        summary: "",
        newDependencies: [],
        infrastructureNotes: [],
      },
      sprintId: selectedSprint,
      dryRun,
      vibeRepo,
      vibeBranch,
      appDir,
    });
  };

  const handleReset = () => {
    setStep(0);
    setLoading(false);
    setCategories({});
    setRoutes([]);
    setStatSummary("");
    setEpics([]);
    setAnalysisJson("");
    setAnalysisError("");
    setFocusArea("");
    setScreenshots([]);
    setCapturing(false);
    setSkipScreenshots(false);
    setBoards([]);
    setLoadingBoards(false);
    setSprints([]);
    setSelectedBoard(null);
    setSelectedSprint(null);
    setDryRun(true);
    setCreating(false);
    setTickets([]);
    setProgressMessage("");
    setErrorMessage("");
    setSavedAnalysisAvailable(false);
    setSavedDiffAvailable(false);
    sendMessage("saveSettings", { key: "lastAnalysis", value: null });
    sendMessage("saveSettings", { key: "lastDiffContext", value: null });
  };

  if (loading) {
    return (
      <div className="vibe-code-tab">
        <StepWizard steps={STEPS} currentStep={step}>
          <Spinner
            text={
              step === 0
                ? "Generating diff..."
                : "Importing analysis..."
            }
          />
        </StepWizard>
      </div>
    );
  }

  return (
    <div className="vibe-code-tab">
      <h2>Vibe Code to Jira</h2>
      <p className="description">
        Compare a prototype branch against production, generate epics and
        stories, capture screenshots, and create Jira tickets.
      </p>
      {errorMessage && <p className="error-text">{errorMessage}</p>}
      <StepWizard steps={STEPS} currentStep={step}>
        {step === 0 && (
          <>
            {(savedAnalysisAvailable || savedDiffAvailable) && (
              <div className="resume-banner">
                <p><strong>Previous session found.</strong></p>
                <div className="step-nav">
                  {savedAnalysisAvailable && (
                    <Button onClick={() => setStep(2)}>
                      Resume: Epic Editor ({epics.length} epics)
                    </Button>
                  )}
                  {savedDiffAvailable && !savedAnalysisAvailable && (
                    <Button onClick={() => setStep(1)}>
                      Resume: Diff Review
                    </Button>
                  )}
                  <Button variant="secondary" onClick={handleReset}>
                    Start Fresh
                  </Button>
                </div>
              </div>
            )}
            <RepoSelector
              vibeRepo={vibeRepo}
              vibeBranch={vibeBranch}
              targetRepo={targetRepo}
              targetBranch={targetBranch}
              appDir={appDir}
              onChange={handleFieldChange}
              onNext={handleGenerateDiff}
            />
          </>
        )}
        {step === 1 && (
          <DiffReview
            categories={categories}
            routes={routes}
            analysisJson={analysisJson}
            onAnalysisJsonChange={setAnalysisJson}
            analysisError={analysisError}
            focusArea={focusArea}
            onFocusAreaChange={setFocusArea}
            onBack={() => setStep(0)}
            onGenerate={handleGenerateAnalysis}
            onImport={handleImportAnalysis}
          />
        )}
        {step === 2 && (
          <EpicEditor
            epics={epics}
            onChange={setEpics}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <ScreenshotReview
            screenshots={screenshots}
            capturing={capturing}
            routes={routes}
            skipScreenshots={skipScreenshots}
            onToggleSkip={() => setSkipScreenshots(!skipScreenshots)}
            onCapture={handleCapture}
            onBack={() => setStep(2)}
            onNext={() => {
              setStep(4);
              if (boards.length === 0 && !loadingBoards) {
                setLoadingBoards(true);
                sendMessage("getBoards");
              }
            }}
          />
        )}
        {step === 4 && (
          <SprintSelector
            boards={boards}
            sprints={sprints}
            selectedBoard={selectedBoard}
            selectedSprint={selectedSprint}
            loading={loadingBoards}
            dryRun={dryRun}
            onBoardChange={handleBoardChange}
            onSprintChange={setSelectedSprint}
            onDryRunToggle={() => setDryRun(!dryRun)}
            onBack={() => setStep(3)}
            onNext={handleCreate}
          />
        )}
        {step === 5 && (
          <CreationProgress
            creating={creating}
            tickets={tickets}
            progressMessage={progressMessage}
            dryRun={dryRun}
            onBack={() => setStep(4)}
            onReset={handleReset}
          />
        )}
      </StepWizard>
    </div>
  );
}
