import React from "react";
import Input from "../../../components/shared/Input";
import Button from "../../../components/shared/Button";
import { sendMessage } from "../../../hooks/useVsCodeMessage";

interface RepoSelectorProps {
  vibeRepo: string;
  vibeBranch: string;
  targetRepo: string;
  targetBranch: string;
  appDir: string;
  onChange: (field: string, value: string) => void;
  onNext: () => void;
}

export default function RepoSelector({
  vibeRepo,
  vibeBranch,
  targetRepo,
  targetBranch,
  appDir,
  onChange,
  onNext,
}: RepoSelectorProps) {
  const canProceed = vibeRepo && vibeBranch && targetRepo && targetBranch;

  return (
    <div className="repo-selector">
      <h3>Repository Selection</h3>
      <p className="description">
        Select the vibe code repo (prototype) and the target repo (production).
      </p>

      <div className="form-section">
        <h4>Vibe Code (prototype)</h4>
        <div className="input-with-browse">
          <Input
            label="Repository Path"
            value={vibeRepo}
            onChange={(e) => onChange("vibeRepo", e.target.value)}
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
          onChange={(e) => onChange("vibeBranch", e.target.value)}
          placeholder="dev"
        />
      </div>

      <div className="form-section">
        <h4>Target (production)</h4>
        <div className="input-with-browse">
          <Input
            label="Repository Path"
            value={targetRepo}
            onChange={(e) => onChange("targetRepo", e.target.value)}
            placeholder="/path/to/production-repo"
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
          value={targetBranch}
          onChange={(e) => onChange("targetBranch", e.target.value)}
          placeholder="origin/main"
        />
      </div>

      <div className="form-section">
        <Input
          label="App Directory"
          value={appDir}
          onChange={(e) => onChange("appDir", e.target.value)}
          placeholder="."
        />
        <p className="description">
          Use <code>.</code> for a standalone repo (app at the root). For
          monorepos, point to the app subdirectory, e.g. <code>apps/web</code>,{" "}
          <code>packages/frontend</code>, or <code>services/api</code>.
        </p>
      </div>

      <div className="step-nav">
        <Button disabled={!canProceed} onClick={onNext}>
          Generate Diff
        </Button>
      </div>
    </div>
  );
}
