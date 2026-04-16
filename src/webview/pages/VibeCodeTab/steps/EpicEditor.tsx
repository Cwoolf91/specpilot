import React, { useState } from "react";
import Button from "../../../components/shared/Button";
import Input from "../../../components/shared/Input";

interface Story {
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

interface Epic {
  title: string;
  description: string;
  stories: Story[];
}

interface EpicEditorProps {
  epics: Epic[];
  onChange: (epics: Epic[]) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}

export default function EpicEditor({
  epics,
  onChange,
  onBack,
  onNext,
  nextLabel = "Next: Screenshots",
}: EpicEditorProps) {
  const [expandedEpic, setExpandedEpic] = useState<number | null>(0);
  const [expandedStory, setExpandedStory] = useState<string | null>(null);

  const updateEpic = (idx: number, field: keyof Epic, value: string) => {
    const updated = epics.map((e, i) =>
      i === idx ? { ...e, [field]: value } : e
    );
    onChange(updated);
  };

  const updateStory = (
    epicIdx: number,
    storyIdx: number,
    field: keyof Story,
    value: string | string[]
  ) => {
    const updated = epics.map((e, ei) =>
      ei === epicIdx
        ? {
            ...e,
            stories: e.stories.map((s, si) =>
              si === storyIdx ? { ...s, [field]: value } : s
            ),
          }
        : e
    );
    onChange(updated);
  };

  const removeStory = (epicIdx: number, storyIdx: number) => {
    const updated = epics.map((e, ei) =>
      ei === epicIdx
        ? { ...e, stories: e.stories.filter((_, si) => si !== storyIdx) }
        : e
    );
    onChange(updated);
  };

  const addStory = (epicIdx: number) => {
    const updated = epics.map((e, ei) =>
      ei === epicIdx
        ? {
            ...e,
            stories: [
              ...e.stories,
              { title: "New Story", description: "", acceptanceCriteria: [] },
            ],
          }
        : e
    );
    onChange(updated);
  };

  const removeEpic = (idx: number) => {
    const updated = epics.filter((_, i) => i !== idx);
    onChange(updated);
    if (expandedEpic === idx) setExpandedEpic(null);
  };

  const totalStories = epics.reduce((sum, e) => sum + e.stories.length, 0);

  return (
    <div className="epic-editor">
      <h3>Edit Epics & Stories</h3>
      <p className="description">
        {epics.length} epics with {totalStories} stories. Edit, add, remove, or
        reorder before creating tickets.
      </p>

      <div className="epic-list">
        {epics.map((epic, epicIdx) => (
          <div key={epicIdx} className="epic-card">
            <div
              className="epic-header"
              onClick={() =>
                setExpandedEpic(expandedEpic === epicIdx ? null : epicIdx)
              }
            >
              <span className="expand-icon">
                {expandedEpic === epicIdx ? "\u25BC" : "\u25B6"}
              </span>
              <strong>{epic.title}</strong>
              <span className="muted">({epic.stories.length} stories)</span>
              <Button
                variant="danger"
                className="btn-small"
                onClick={(e) => {
                  e.stopPropagation();
                  removeEpic(epicIdx);
                }}
              >
                Remove
              </Button>
            </div>

            {expandedEpic === epicIdx && (
              <div className="epic-body">
                <Input
                  label="Epic Title"
                  value={epic.title}
                  onChange={(e) =>
                    updateEpic(epicIdx, "title", e.target.value)
                  }
                />
                <div className="input-group">
                  <label>Description</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={epic.description}
                    onChange={(e) =>
                      updateEpic(epicIdx, "description", e.target.value)
                    }
                  />
                </div>

                <div className="story-list">
                  {epic.stories.map((story, storyIdx) => {
                    const storyKey = `${epicIdx}-${storyIdx}`;
                    return (
                      <div key={storyKey} className="story-card">
                        <div
                          className="story-header"
                          onClick={() =>
                            setExpandedStory(
                              expandedStory === storyKey ? null : storyKey
                            )
                          }
                        >
                          <span className="expand-icon">
                            {expandedStory === storyKey ? "\u25BC" : "\u25B6"}
                          </span>
                          <span>{story.title}</span>
                          <Button
                            variant="danger"
                            className="btn-small"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeStory(epicIdx, storyIdx);
                            }}
                          >
                            x
                          </Button>
                        </div>

                        {expandedStory === storyKey && (
                          <div className="story-body">
                            <Input
                              label="Title"
                              value={story.title}
                              onChange={(e) =>
                                updateStory(
                                  epicIdx,
                                  storyIdx,
                                  "title",
                                  e.target.value
                                )
                              }
                            />
                            <div className="input-group">
                              <label>Description</label>
                              <textarea
                                className="input"
                                rows={3}
                                value={story.description}
                                onChange={(e) =>
                                  updateStory(
                                    epicIdx,
                                    storyIdx,
                                    "description",
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                            <div className="input-group">
                              <label>Acceptance Criteria (one per line)</label>
                              <textarea
                                className="input"
                                rows={3}
                                value={story.acceptanceCriteria.join("\n")}
                                onChange={(e) =>
                                  updateStory(
                                    epicIdx,
                                    storyIdx,
                                    "acceptanceCriteria",
                                    e.target.value
                                      .split("\n")
                                      .filter((l) => l.trim())
                                  )
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  variant="secondary"
                  onClick={() => addStory(epicIdx)}
                >
                  + Add Story
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="step-nav">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={totalStories === 0}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
