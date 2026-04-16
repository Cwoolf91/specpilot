/**
 * Jira issue CRUD operations.
 */

import type {
  JiraClient,
  JiraIssue,
  JiraStoryInfo,
  EpicPlan,
  AiAnalysis,
  ScreenshotMapping,
  TicketCreationConfig,
  AdfDocument,
  AdfNode,
  StoryPlan,
} from "../types.js";
import type { ProgressReporter } from "../progress.js";
import {
  buildAdfDocument,
  adfHeading,
  adfParagraph,
  adfBulletList,
  adfCodeBlock,
} from "../adf.js";
import { extractTextFromAdf, validateIssueKey } from "../utils.js";
import { SPRINT_CAPACITY_WARN } from "../types.js";
import type { IssueTypeMap } from "../types.js";
import { resolveIssueTypeId } from "./issue-types.js";

// ---------------------------------------------------------------------------
// Search & Fetch
// ---------------------------------------------------------------------------

export async function fetchEpicStories(
  client: JiraClient,
  epicKey: string
): Promise<JiraStoryInfo[]> {
  const res = await client.jiraFetch("/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql: `parent = ${validateIssueKey(epicKey)} ORDER BY key ASC`,
      fields: ["summary", "description", "attachment"],
      maxResults: 50,
    }),
  });
  const data = (await res.json()) as {
    issues?: {
      key: string;
      fields: {
        summary: string;
        description?: unknown;
        attachment?: { filename: string }[];
      };
    }[];
  };

  return (data.issues || []).map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary,
    description: extractTextFromAdf(issue.fields.description),
    hasAttachments: (issue.fields.attachment?.length || 0) > 0,
    attachmentCount: issue.fields.attachment?.length || 0,
  }));
}

export interface ExistingEpic {
  key: string;
  summary: string;
  stories: { key: string; summary: string; description: string }[];
}

export async function fetchVibeCodeEpics(
  client: JiraClient,
  label = "vibe-code",
): Promise<ExistingEpic[]> {
  const jql = `labels = "${label}" AND issuetype = Epic ORDER BY created DESC`;
  const res = await client.jiraFetch("/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql,
      fields: ["summary"],
      maxResults: 50,
    }),
  });
  const data = (await res.json()) as { issues?: JiraIssue[] };
  const epics = data.issues ?? [];

  const results: ExistingEpic[] = [];
  for (const epic of epics) {
    const stories = await fetchEpicStories(client, epic.key);
    results.push({
      key: epic.key,
      summary: epic.fields.summary,
      stories: stories.map((s) => ({
        key: s.key,
        summary: s.summary,
        description: s.description,
      })),
    });
  }
  return results;
}

export interface EpicDetails {
  key: string;
  summary: string;
  description: string;
  status: string;
  labels: string[];
  stories: JiraStoryInfo[];
}

export async function fetchEpicDetails(
  client: JiraClient,
  epicKey: string
): Promise<EpicDetails> {
  const validated = validateIssueKey(epicKey);
  const res = await client.jiraFetch(`/rest/api/3/issue/${validated}?fields=summary,description,status,labels`);
  const issue = (await res.json()) as JiraIssue;
  const stories = await fetchEpicStories(client, validated);
  return {
    key: issue.key,
    summary: issue.fields.summary,
    description: extractTextFromAdf(issue.fields.description),
    status: (issue.fields.status as { name?: string } | undefined)?.name ?? "",
    labels: (issue.fields as Record<string, unknown>).labels as string[] ?? [],
    stories,
  };
}

export async function createStoriesForExistingEpic(
  client: JiraClient,
  epicKey: string,
  stories: StoryPlan[],
  config: Pick<TicketCreationConfig, "projectKey" | "sprintId" | "dryRun">,
  vibeRepo: string,
  vibeBranch: string,
  progress: ProgressReporter,
  issueTypeMap: IssueTypeMap = {},
  label = "vibe-code",
): Promise<string[]> {
  const validated = validateIssueKey(epicKey);
  const createdKeys: string[] = [];

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    progress.report(`Creating story ${i + 1}/${stories.length}: ${story.title}`);

    if (config.dryRun) {
      const fakeKey = `${config.projectKey}-DRY${i + 1}`;
      createdKeys.push(fakeKey);
      continue;
    }

    const description = buildStoryDescription(story, vibeRepo, vibeBranch);
    const res = await client.jiraFetch("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({
        fields: {
          project: { key: config.projectKey },
          issuetype: { id: resolveIssueTypeId(issueTypeMap, "Story") },
          parent: { key: validated },
          summary: story.title,
          description,
          labels: [label],
        },
      }),
    });
    const created = (await res.json()) as { key: string };
    createdKeys.push(created.key);
    progress.report(`  Created ${created.key}`);
  }

  // Dependency links
  for (let i = 0; i < stories.length; i++) {
    const deps = stories[i].dependsOn ?? [];
    for (const depIdx of deps) {
      if (depIdx >= 0 && depIdx < createdKeys.length && depIdx !== i && !config.dryRun) {
        try {
          await client.jiraFetch("/rest/api/3/issueLink", {
            method: "POST",
            body: JSON.stringify({
              type: { name: "Blocks" },
              inwardIssue: { key: createdKeys[i] },
              outwardIssue: { key: createdKeys[depIdx] },
            }),
          });
        } catch {
          progress.warn(`  Failed to link ${createdKeys[i]} → ${createdKeys[depIdx]}`);
        }
      }
    }
  }

  // Sprint assignment
  if (config.sprintId && createdKeys.length > 0 && !config.dryRun) {
    progress.report(`Moving ${createdKeys.length} stories to sprint...`);
    try {
      await client.jiraFetch(`/rest/agile/1.0/sprint/${config.sprintId}/issue`, {
        method: "POST",
        body: JSON.stringify({ issues: createdKeys }),
      });
    } catch (err) {
      progress.warn(`Sprint assignment failed: ${(err as Error).message}`);
    }
  }

  return createdKeys;
}

export async function listVibeCodeTickets(
  client: JiraClient,
  projectKey: string,
  progress: ProgressReporter,
  label = "vibe-code",
): Promise<void> {
  progress.report(`\nListing ${label} tickets in project ${projectKey}...\n`);

  const jql = encodeURIComponent(
    `project = "${projectKey}" AND labels = "${label}" ORDER BY issuetype ASC, created DESC, key ASC`
  );
  const res = await client.jiraFetch(
    `/rest/api/3/search?jql=${jql}&fields=summary,status,created,issuetype,parent,attachment&maxResults=100`
  );
  const data = (await res.json()) as {
    issues: Array<{
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        created: string;
        issuetype: { name: string };
        parent?: { key: string };
        attachment: Array<{ filename: string }>;
      };
    }>;
  };

  if (data.issues.length === 0) {
    progress.report(`  No ${label} tickets found.`);
    return;
  }

  const epics = data.issues.filter((i) => i.fields.issuetype.name === "Epic");
  const storiesByEpic = new Map<string, typeof data.issues>();
  for (const issue of data.issues) {
    if (issue.fields.parent?.key) {
      const arr = storiesByEpic.get(issue.fields.parent.key) || [];
      arr.push(issue);
      storiesByEpic.set(issue.fields.parent.key, arr);
    }
  }

  for (const epic of epics) {
    const stories = storiesByEpic.get(epic.key) || [];
    const withScreenshots = stories.filter(
      (s) => s.fields.attachment && s.fields.attachment.length > 0
    ).length;
    const created = new Date(epic.fields.created).toLocaleDateString();

    progress.report(
      `${epic.key}  ${epic.fields.status.name.padEnd(12)} ${epic.fields.summary}`
    );
    progress.report(
      `  Created: ${created}  |  Stories: ${stories.length}  |  With screenshots: ${withScreenshots}/${stories.length}`
    );

    for (const story of stories) {
      const hasAttachment =
        story.fields.attachment && story.fields.attachment.length > 0;
      const status = story.fields.status.name;
      const attachIcon = hasAttachment ? "[img]" : "     ";
      progress.report(
        `    ${story.key}  ${status.padEnd(12)} ${attachIcon} ${story.fields.summary}`
      );
    }
    progress.report("");
  }

  progress.report(
    `Total: ${epics.length} epic(s), ${data.issues.length - epics.length} stories`
  );
}

// ---------------------------------------------------------------------------
// Description Builders
// ---------------------------------------------------------------------------

export function buildEpicDescription(
  epic: EpicPlan,
  vibeRepo: string,
  vibeBranch: string,
  appDir: string,
  analysis: AiAnalysis
): AdfDocument {
  const content: AdfNode[] = [
    adfParagraph(epic.description),
    adfHeading(3, "Prototype Reference"),
    adfParagraph(
      `Repo: ${vibeRepo}\nBranch: ${vibeBranch}\nApp directory: ${appDir}`
    ),
    adfHeading(3, "Stories"),
    adfBulletList(epic.stories.map((s) => s.title)),
  ];

  if (analysis.infrastructureNotes.length > 0) {
    content.push(adfHeading(3, "Infrastructure Notes"));
    content.push(adfBulletList(analysis.infrastructureNotes));
  }

  if (analysis.newDependencies.length > 0) {
    content.push(adfHeading(3, "New Dependencies"));
    content.push(adfBulletList(analysis.newDependencies));
  }

  return buildAdfDocument(content);
}

export function buildStoryDescription(
  story: StoryPlan,
  vibeRepo: string,
  vibeBranch: string
): AdfDocument {
  const content: AdfNode[] = [
    adfParagraph(story.description),
    adfHeading(3, "Acceptance Criteria"),
    adfBulletList(story.acceptanceCriteria),
    adfHeading(3, "Prototype Reference"),
    adfParagraph(`Branch: ${vibeBranch} (${vibeRepo})`),
  ];

  if (story.sourceFiles.length > 0) {
    content.push(adfCodeBlock(story.sourceFiles.join("\n")));
  }

  if (story.screenshotRoutes.length > 0) {
    content.push(
      adfParagraph(
        "See attached screenshots for visual reference of the prototype UI."
      )
    );
  }

  return buildAdfDocument(content);
}

// ---------------------------------------------------------------------------
// Ticket Creation
// ---------------------------------------------------------------------------

export async function createJiraTickets(
  client: JiraClient,
  analysis: AiAnalysis,
  screenshots: Map<string, string>,
  config: TicketCreationConfig,
  vibeRepo: string,
  vibeBranch: string,
  appDir: string,
  progress: ProgressReporter,
  issueTypeMap: IssueTypeMap = {},
  label = "vibe-code",
): Promise<string[]> {
  progress.section("Creating Jira tickets...");

  const allIssueKeys: string[] = [];

  for (const epic of analysis.epics) {
    // Create Epic
    const epicBody = {
      fields: {
        project: { key: config.projectKey },
        issuetype: { id: resolveIssueTypeId(issueTypeMap, "Epic") },
        summary: epic.title,
        description: buildEpicDescription(
          epic, vibeRepo, vibeBranch, appDir, analysis
        ),
        labels: [label],
      },
    };

    let epicKey: string;
    try {
      const epicRes = await client.jiraFetch("/rest/api/3/issue", {
        method: "POST",
        body: JSON.stringify(epicBody),
      });
      const epicData = (await epicRes.json()) as { key: string };
      epicKey = epicData.key;
      allIssueKeys.push(epicKey);
      progress.report(`  Created epic ${epicKey}: ${epic.title}`);
    } catch (err) {
      progress.error(
        `FAILED to create epic "${epic.title}": ${(err as Error).message.split("\n")[0]}`
      );
      continue;
    }

    // Create Stories
    const storyKeys: (string | null)[] = [];

    for (let si = 0; si < epic.stories.length; si++) {
      const story = epic.stories[si];
      const storyBody = {
        fields: {
          project: { key: config.projectKey },
          issuetype: { id: resolveIssueTypeId(issueTypeMap, "Story") },
          summary: story.title,
          description: buildStoryDescription(story, vibeRepo, vibeBranch),
          parent: { key: epicKey },
          labels: [label],
        },
      };

      let storyKey: string;
      try {
        const storyRes = await client.jiraFetch("/rest/api/3/issue", {
          method: "POST",
          body: JSON.stringify(storyBody),
        });
        const storyData = (await storyRes.json()) as { key: string };
        storyKey = storyData.key;
        storyKeys.push(storyKey);
        allIssueKeys.push(storyKey);
        progress.report(`    Created story ${storyKey}: ${story.title}`);
      } catch (err) {
        storyKeys.push(null);
        progress.error(
          `FAILED to create story "${story.title}": ${(err as Error).message.split("\n")[0]}`
        );
        continue;
      }

      // Attach screenshots
      for (const route of story.screenshotRoutes) {
        const screenshotPath = screenshots.get(route);
        if (screenshotPath) {
          try {
            await client.uploadAttachment(storyKey, screenshotPath);
            const { basename } = await import("path");
            progress.report(`      Attached: ${basename(screenshotPath)}`);
          } catch (err) {
            progress.error(
              `Failed to attach screenshot: ${(err as Error).message.split("\n")[0]}`
            );
          }
        }
      }
    }

    // Create dependency links
    for (let si = 0; si < epic.stories.length; si++) {
      const story = epic.stories[si];
      const thisKey = storyKeys[si];
      if (!thisKey || !story.dependsOn?.length) continue;

      for (const depIndex of story.dependsOn) {
        const depKey = storyKeys[depIndex];
        if (!depKey) continue;
        try {
          await client.jiraFetch("/rest/api/3/issueLink", {
            method: "POST",
            body: JSON.stringify({
              type: { name: "Blocks" },
              inwardIssue: { key: thisKey },
              outwardIssue: { key: depKey },
            }),
          });
          progress.report(`    Linked: ${depKey} blocks ${thisKey}`);
        } catch {
          // Non-blocking
        }
      }
    }
  }

  // Move to sprint if selected
  if (config.sprintId && allIssueKeys.length > 0) {
    try {
      const res = await client.jiraFetch(
        `/rest/agile/1.0/sprint/${config.sprintId}/issue?maxResults=0`
      );
      const data = (await res.json()) as { total: number };
      progress.report(
        `\n  Sprint currently has ${data.total} issue(s). Adding ${allIssueKeys.length} more.`
      );
      if (data.total + allIssueKeys.length > SPRINT_CAPACITY_WARN) {
        progress.warn(
          `Sprint will have ${data.total + allIssueKeys.length} issues (threshold: ${SPRINT_CAPACITY_WARN})`
        );
      }
    } catch {
      // Non-blocking
    }

    try {
      await client.jiraFetch(
        `/rest/agile/1.0/sprint/${config.sprintId}/issue`,
        {
          method: "POST",
          body: JSON.stringify({ issues: allIssueKeys }),
        }
      );
      progress.report(
        `Moved ${allIssueKeys.length} issues to sprint ${config.sprintId}`
      );
    } catch (err) {
      progress.error(
        `Failed to move issues to sprint: ${(err as Error).message.split("\n")[0]}`
      );
    }
  }

  return allIssueKeys;
}
