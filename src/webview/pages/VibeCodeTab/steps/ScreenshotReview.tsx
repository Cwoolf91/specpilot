import React from "react";
import Button from "../../../components/shared/Button";
import Spinner from "../../../components/shared/Spinner";

interface Screenshot {
  route: string;
  path: string;
}

interface ScreenshotReviewProps {
  screenshots: Screenshot[];
  capturing: boolean;
  routes: string[];
  skipScreenshots: boolean;
  onToggleSkip: () => void;
  onCapture: () => void;
  onBack: () => void;
  onNext: () => void;
}

export default function ScreenshotReview({
  screenshots,
  capturing,
  routes,
  skipScreenshots,
  onToggleSkip,
  onCapture,
  onBack,
  onNext,
}: ScreenshotReviewProps) {
  return (
    <div className="screenshot-review">
      <h3>Screenshots</h3>
      <p className="description">
        Capture screenshots of the vibe code prototype to attach to stories.
      </p>

      <div className="skip-toggle">
        <label>
          <input
            type="checkbox"
            checked={skipScreenshots}
            onChange={onToggleSkip}
          />
          Skip screenshots
        </label>
      </div>

      {!skipScreenshots && (
        <>
          {routes.length > 0 && (
            <div className="routes-preview">
              <h4>Routes to capture ({routes.length})</h4>
              <div className="routes-list">
                {routes.map((r) => (
                  <span key={r} className="route-tag">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!capturing && screenshots.length === 0 && (
            <Button onClick={onCapture} disabled={routes.length === 0}>
              Capture Screenshots
            </Button>
          )}

          {capturing && <Spinner text="Capturing screenshots..." />}

          {screenshots.length > 0 && (
            <div className="screenshot-gallery">
              <h4>{screenshots.length} screenshots captured</h4>
              <div className="gallery-grid">
                {screenshots.map((s) => (
                  <div key={s.route} className="screenshot-item">
                    <div className="screenshot-label">{s.route}</div>
                    <div className="screenshot-path">{s.path}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="step-nav">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          {skipScreenshots ? "Skip to Sprint" : "Next: Sprint"}
        </Button>
      </div>
    </div>
  );
}
