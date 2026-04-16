/**
 * Default BDD templates for Jira ticket creation.
 * These define the section structure for AI-generated tickets.
 */

export const STORY_TEMPLATE = `## Story

As a <user/persona>, I want to <need> so that <value>.

## Why

<Brief explanation of the business value, user value, or operational value.>

## Acceptance Criteria

- Given <starting state>, when <action>, then <expected result>.
- Given <starting state>, when <action>, then <expected result>.
- Given <starting state>, when <action>, then <expected result>.

## Release Instructions

<Notes on release instructions, feature flags, rollout considerations, or dependencies if applicable.>`;

export const EPIC_TEMPLATE = `## Problem / Why

<Describe the problem being solved, who it impacts, and why it matters now.>

## Goal / Outcome

<Describe the desired business outcome in plain language.>

## Success Metrics (SMART)

- <Metric 1>: **TBD**
- <Metric 2>: **TBD**
- <Metric 3>: **TBD**

## Scope (In)

- <Capability / workflow / integration in scope>
- <Objects / systems impacted>
- <Visibility / status / reporting needs>
- <Operational workflow considerations>

## Non-Goals (Out)

- <Explicitly out of scope item>
- <Explicitly out of scope item>
- <Future phase item not included in this epic>

## Personas / Stakeholders

- <Primary business users>
- <Operations / Support / Implementation teams>
- <Other impacted teams or users>

## Assumptions & Constraints

- <Key business or system constraint>
- <Dependency on existing workflows or systems>
- <Compliance / timing / operational limitation>

## High-Level Solution

<Describe at a high level how the solution will work within the current business and operational model. Keep this business/product focused, not deeply technical.>

## Epic-Level Acceptance Criteria

- <Acceptance criterion tied to routing / visibility / workflow>
- <Acceptance criterion tied to object or data consistency>
- <Acceptance criterion tied to operational supportability>
- <Acceptance criterion tied to status / audit / reporting>

## Risks & Mitigations

- **<Risk>** → <Mitigation>
- **<Risk>** → <Mitigation>
- **<Risk>** → <Mitigation>

## Rollout Plan

<TBD or describe pilot / phased rollout / enablement approach>

## Analytics & Reporting

- <Adoption / volume metric>
- <Operational success / exception metric>
- <Support / reporting metric>

## Definition of Done (Epic)

- <Business workflow is supported end-to-end>
- <Required object / status / data changes are live>
- <Operational workflow and support process are documented>
- <Reporting / dashboards / alerts are available as needed>

## Open Questions

- <Open question 1>
- <Open question 2>

## Resources

- <Link to API / vendor docs / diagrams / related pages>

## BDD (Epic-Level Scenarios)

### Feature: <Primary business capability>

Scenario: <Main successful business flow>
  Given <starting business state>
  When <business action or event occurs>
  Then <expected business outcome>
  And <secondary expected outcome>`;
