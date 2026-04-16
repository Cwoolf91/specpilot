import React, { useEffect } from "react";
import Button from "../../../components/shared/Button";
import Select from "../../../components/shared/Select";
import Spinner from "../../../components/shared/Spinner";
import { sendMessage } from "../../../hooks/useVsCodeMessage";

interface Board {
  id: number;
  name: string;
}

interface Sprint {
  id: number;
  name: string;
  state: string;
}

interface SprintSelectorProps {
  boards: Board[];
  sprints: Sprint[];
  selectedBoard: number | null;
  selectedSprint: number | null;
  loading: boolean;
  dryRun: boolean;
  onBoardChange: (id: number) => void;
  onSprintChange: (id: number | null) => void;
  onDryRunToggle: () => void;
  onBack: () => void;
  onNext: () => void;
}

export default function SprintSelector({
  boards,
  sprints,
  selectedBoard,
  selectedSprint,
  loading,
  dryRun,
  onBoardChange,
  onSprintChange,
  onDryRunToggle,
  onBack,
  onNext,
}: SprintSelectorProps) {
  useEffect(() => {
    if (boards.length === 0) {
      sendMessage("getBoards");
    }
  }, []);

  return (
    <div className="sprint-selector">
      <h3>Sprint Selection</h3>
      <p className="description">
        Optionally assign created tickets to a sprint.
      </p>

      {loading ? (
        <Spinner text="Loading boards..." />
      ) : (
        <>
          <Select
            label="Board"
            options={[
              { value: "", label: "Select a board..." },
              ...boards.map((b) => ({
                value: String(b.id),
                label: b.name,
              })),
            ]}
            value={selectedBoard ? String(selectedBoard) : ""}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              if (!isNaN(id)) onBoardChange(id);
            }}
          />

          {sprints.length > 0 && (
            <Select
              label="Sprint"
              options={[
                { value: "", label: "No sprint (skip)" },
                ...sprints.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.state})`,
                })),
              ]}
              value={selectedSprint ? String(selectedSprint) : ""}
              onChange={(e) => {
                const id = parseInt(e.target.value, 10);
                onSprintChange(isNaN(id) ? null : id);
              }}
            />
          )}

          <div className="dry-run-toggle">
            <label>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={onDryRunToggle}
              />
              Dry run (preview only, no tickets created)
            </label>
          </div>
        </>
      )}

      <div className="step-nav">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          {dryRun ? "Preview" : "Create Tickets"}
        </Button>
      </div>
    </div>
  );
}
