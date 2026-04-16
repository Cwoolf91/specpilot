import React from "react";

export interface Step {
  label: string;
}

interface StepWizardProps {
  steps: Step[];
  currentStep: number;
  children: React.ReactNode;
}

export default function StepWizard({
  steps,
  currentStep,
  children,
}: StepWizardProps) {
  return (
    <div className="step-wizard">
      <div className="step-indicators">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`step-indicator ${
              i === currentStep
                ? "step-current"
                : i < currentStep
                  ? "step-done"
                  : "step-pending"
            }`}
          >
            <span className="step-number">
              {i < currentStep ? "\u2713" : i + 1}
            </span>
            <span className="step-label">{step.label}</span>
          </div>
        ))}
      </div>
      <div className="step-content">{children}</div>
    </div>
  );
}
