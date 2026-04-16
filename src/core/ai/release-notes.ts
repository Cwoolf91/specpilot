/**
 * Release note formatting utilities.
 *
 * Notes are generated externally by Claude in conversation and passed
 * as pre-built ReleaseNotesResult JSON. This module handles formatting only.
 */

import type { ReleaseNotesResult } from "../types.js";

export function formatPlainText(
  notes: ReleaseNotesResult,
  versionName: string
): string {
  const lines: string[] = [
    `Release Notes — ${versionName}`,
    "",
    `Summary: ${notes.summary}`,
    "",
  ];

  for (const cat of notes.categories) {
    lines.push(`${cat.name}`);
    for (const item of cat.items) {
      lines.push(`• ${item.key} — ${item.summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
