import React from "react";
import Button from "../../../components/shared/Button";
import StatusBadge from "../../../components/shared/StatusBadge";
import Spinner from "../../../components/shared/Spinner";

interface CreatedTicket {
  key: string;
  summary: string;
  type: string;
  url?: string;
}

interface CreationProgressProps {
  creating: boolean;
  tickets: CreatedTicket[];
  progressMessage: string;
  dryRun: boolean;
  onBack: () => void;
  onReset: () => void;
}

export default function CreationProgress({
  creating,
  tickets,
  progressMessage,
  dryRun,
  onBack,
  onReset,
}: CreationProgressProps) {
  return (
    <div className="creation-progress">
      <h3>{dryRun ? "Dry Run Preview" : "Creating Tickets"}</h3>

      {creating && <Spinner text={progressMessage || "Creating..."} />}

      {tickets.length > 0 && (
        <div className="tickets-list">
          <h4>
            {dryRun ? "Would create" : "Created"} {tickets.length} tickets
          </h4>
          <table className="tickets-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Type</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.key}>
                  <td>
                    <StatusBadge
                      status={t.type === "Epic" ? "info" : "default"}
                      label={t.key}
                    />
                  </td>
                  <td>{t.type}</td>
                  <td>{t.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!creating && (
        <div className="step-nav">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onReset}>Start Over</Button>
        </div>
      )}
    </div>
  );
}
