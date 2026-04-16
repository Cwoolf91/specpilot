import React from "react";
import Spinner from "../shared/Spinner";

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

interface ProgressOverlayProps {
  visible: boolean;
  title: string;
  steps: ProgressStep[];
  message?: string;
}

export default function ProgressOverlay({
  visible,
  title,
  steps,
  message,
}: ProgressOverlayProps) {
  if (!visible) return null;

  return (
    <div className="progress-overlay">
      <div className="progress-card">
        <h2>{title}</h2>
        <div className="progress-steps">
          {steps.map((step, i) => (
            <div key={i} className={`progress-step progress-${step.status}`}>
              <span className="progress-icon">
                {step.status === "done"
                  ? "\u2713"
                  : step.status === "error"
                    ? "\u2717"
                    : step.status === "active"
                      ? "\u25CF"
                      : "\u25CB"}
              </span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
        {message && <p className="progress-message">{message}</p>}
        {steps.some((s) => s.status === "active") && <Spinner text="" />}
      </div>
    </div>
  );
}
