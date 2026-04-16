import React from "react";

const COLORS: Record<string, string> = {
  success: "var(--vscode-testing-iconPassed, #4caf50)",
  warning: "var(--vscode-editorWarning-foreground, #ff9800)",
  error: "var(--vscode-errorForeground, #f44336)",
  info: "var(--vscode-textLink-foreground, #3794ff)",
  default: "var(--vscode-descriptionForeground, #888)",
};

interface StatusBadgeProps {
  status: keyof typeof COLORS;
  label: string;
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className="status-badge"
      style={{
        color: COLORS[status] ?? COLORS.default,
        border: `1px solid ${COLORS[status] ?? COLORS.default}`,
      }}
    >
      {label}
    </span>
  );
}
