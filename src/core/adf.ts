/**
 * Atlassian Document Format (ADF) builder helpers.
 */

import type { AdfNode, AdfDocument } from "./types.js";

export function buildAdfDocument(content: AdfNode[]): AdfDocument {
  return { version: 1, type: "doc", content };
}

export function adfHeading(level: number, text: string): AdfNode {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

export function adfParagraph(text: string): AdfNode {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

export function adfBulletList(items: string[]): AdfNode {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: item }],
        },
      ],
    })),
  };
}

export function adfCodeBlock(text: string, language?: string): AdfNode {
  return {
    type: "codeBlock",
    attrs: { language: language || "text" },
    content: [{ type: "text", text }],
  };
}
