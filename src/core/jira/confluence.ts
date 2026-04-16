/**
 * Confluence publishing operations.
 */

import type { JiraClient, ReleaseNotesResult } from "../types.js";
import { buildAuthHeader } from "../config.js";

const CONFLUENCE_PARENT_PAGE_ID = "2287206408";
const CONFLUENCE_SPACE_KEY = "PT1";

function buildConfluenceAdf(
  notes: ReleaseNotesResult,
  versionName: string
): unknown {
  const content: unknown[] = [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: `Release Notes — ${versionName}` }],
    },
  ];

  for (const cat of notes.categories) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: cat.name }],
    });

    content.push({
      type: "bulletList",
      content: cat.items.map((item) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: `${item.key} — ${item.summary}` },
            ],
          },
        ],
      })),
    });
  }

  return { version: 1, type: "doc", content };
}

export async function publishToConfluence(
  client: JiraClient,
  notes: ReleaseNotesResult,
  versionName: string,
  cloudId: string
): Promise<string> {
  const { baseUrl } = client.credentials;
  const authHeader = buildAuthHeader(
    client.credentials.email,
    client.credentials.apiToken
  );
  const title = `Release Notes — ${versionName}`;
  const adfBody = buildConfluenceAdf(notes, versionName);

  // Check if page already exists
  const searchRes = await client.jiraFetch(
    `${baseUrl}/wiki/api/v2/pages?title=${encodeURIComponent(title)}&space-id=&status=current&limit=10`
  );
  const searchData = (await searchRes.json()) as {
    results?: { id: string; version?: { number: number } }[];
  };
  const existing = searchData.results?.[0];

  if (existing) {
    const version = (existing.version?.number || 1) + 1;
    const updateRes = await fetch(`${baseUrl}/wiki/api/v2/pages/${existing.id}`, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: existing.id,
        status: "current",
        title,
        body: {
          representation: "atlas_doc_format",
          value: JSON.stringify(adfBody),
        },
        version: { number: version },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!updateRes.ok) {
      const body = await updateRes.text();
      throw new Error(
        `Confluence update failed (${updateRes.status}): ${body.slice(0, 500)}`
      );
    }
    const updated = (await updateRes.json()) as {
      id: string;
      _links?: { webui?: string };
    };
    return `${baseUrl}/wiki${updated._links?.webui || ""}`;
  }

  // Create new page
  const spaceId = await getConfluenceSpaceId(baseUrl, authHeader);
  const createRes = await fetch(`${baseUrl}/wiki/api/v2/pages`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      spaceId,
      status: "current",
      title,
      parentId: CONFLUENCE_PARENT_PAGE_ID,
      body: {
        representation: "atlas_doc_format",
        value: JSON.stringify(adfBody),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(
      `Confluence create failed (${createRes.status}): ${body.slice(0, 500)}`
    );
  }

  const created = (await createRes.json()) as {
    id: string;
    _links?: { webui?: string };
  };
  return `${baseUrl}/wiki${created._links?.webui || ""}`;
}

async function getConfluenceSpaceId(
  baseUrl: string,
  authHeader: string
): Promise<string> {
  const res = await fetch(
    `${baseUrl}/wiki/api/v2/spaces?keys=${CONFLUENCE_SPACE_KEY}&limit=1`,
    {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to get space ID for ${CONFLUENCE_SPACE_KEY}`);
  }
  const data = (await res.json()) as { results?: { id: string }[] };
  if (!data.results?.[0]?.id) {
    throw new Error(`Space ${CONFLUENCE_SPACE_KEY} not found`);
  }
  return data.results[0].id;
}
