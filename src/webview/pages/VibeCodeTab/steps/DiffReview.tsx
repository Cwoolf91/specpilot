import React from "react";
import Button from "../../../components/shared/Button";
import StatusBadge from "../../../components/shared/StatusBadge";

interface DiffReviewProps {
  categories: Record<string, string[]>;
  routes: string[];
  analysisJson: string;
  onAnalysisJsonChange: (value: string) => void;
  analysisError: string;
  focusArea: string;
  onFocusAreaChange: (value: string) => void;
  onBack: () => void;
  onGenerate: () => void;
  onImport: () => void;
}

export default function DiffReview({
  categories,
  routes,
  analysisJson,
  onAnalysisJsonChange,
  analysisError,
  focusArea,
  onFocusAreaChange,
  onBack,
  onGenerate,
  onImport,
}: DiffReviewProps) {
  const totalFiles = Object.values(categories).reduce(
    (sum, files) => sum + files.length,
    0
  );

  return (
    <div className="diff-review">
      <h3>Diff Review</h3>
      <p className="description">
        {totalFiles} changed files across {Object.keys(categories).length}{" "}
        categories. {routes.length} routes detected.
      </p>

      <div className="categories-grid">
        {Object.entries(categories).map(([category, files]) => (
          <div key={category} className="category-card">
            <div className="category-header">
              <strong>{category}</strong>
              <StatusBadge status="info" label={`${files.length}`} />
            </div>
            <ul className="file-list">
              {files.slice(0, 10).map((file) => (
                <li key={file} className="file-item">
                  {file}
                </li>
              ))}
              {files.length > 10 && (
                <li className="file-item muted">
                  ...and {files.length - 10} more
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {routes.length > 0 && (
        <div className="routes-section">
          <h4>Detected Routes</h4>
          <div className="routes-list">
            {routes.map((route) => (
              <span key={route} className="route-tag">
                {route}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="input-group">
        <label>Focus Area (optional)</label>
        <textarea
          className="input"
          rows={3}
          value={focusArea}
          onChange={(e) => onFocusAreaChange(e.target.value)}
          placeholder="e.g., Focus on the authentication changes and new search page. Ignore infrastructure and config changes."
        />
        <p className="muted">
          Guide the AI to focus on specific features. Without this, it analyzes the entire diff.
        </p>
      </div>

      <div className="step-nav">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onGenerate} disabled={totalFiles === 0}>
          Generate Analysis
        </Button>
      </div>

      <details className="manual-import-toggle">
        <summary>Manual Import (paste JSON)</summary>
        <textarea
          className="analysis-textarea"
          rows={10}
          value={analysisJson}
          onChange={(e) => onAnalysisJsonChange(e.target.value)}
          placeholder={'{\n  "epics": [\n    {\n      "title": "...",\n      "description": "...",\n      "stories": [...]\n    }\n  ]\n}'}
        />
        {analysisError && <p className="error-text">{analysisError}</p>}
        <Button onClick={onImport} disabled={!analysisJson.trim()}>
          Import Analysis
        </Button>
      </details>
    </div>
  );
}
