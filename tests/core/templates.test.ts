import { describe, it, expect } from "vitest";
import { STORY_TEMPLATE, EPIC_TEMPLATE } from "../../src/core/templates.js";

describe("STORY_TEMPLATE", () => {
  it("contains required BDD sections", () => {
    expect(STORY_TEMPLATE).toContain("## Story");
    expect(STORY_TEMPLATE).toContain("## Why");
    expect(STORY_TEMPLATE).toContain("## Acceptance Criteria");
    expect(STORY_TEMPLATE).toContain("## Release Instructions");
  });

  it("references Given/When/Then", () => {
    expect(STORY_TEMPLATE).toMatch(/Given .* when .* then/i);
  });
});

describe("EPIC_TEMPLATE", () => {
  it("contains all required epic sections", () => {
    const required = [
      "## Problem / Why",
      "## Goal / Outcome",
      "## Success Metrics",
      "## Scope (In)",
      "## Non-Goals (Out)",
      "## Personas",
      "## Assumptions",
      "## High-Level Solution",
      "## Epic-Level Acceptance Criteria",
      "## Risks",
      "## Rollout Plan",
      "## Analytics",
      "## Definition of Done",
      "## Open Questions",
      "## Resources",
      "## BDD",
    ];
    for (const section of required) {
      expect(EPIC_TEMPLATE).toContain(section);
    }
  });
});
