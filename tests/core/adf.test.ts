import { describe, it, expect } from "vitest";
import {
  buildAdfDocument,
  adfHeading,
  adfParagraph,
  adfBulletList,
  adfCodeBlock,
} from "../../src/core/adf.js";

describe("adf builders", () => {
  it("wraps nodes in a version-1 doc", () => {
    const doc = buildAdfDocument([adfParagraph("hi")]);
    expect(doc).toEqual({
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hi" }],
        },
      ],
    });
  });

  it("adfHeading encodes level attr and text node", () => {
    expect(adfHeading(2, "Title")).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Title" }],
    });
  });

  it("adfParagraph always produces a single text node", () => {
    const p = adfParagraph("body");
    expect(p.type).toBe("paragraph");
    expect(p.content).toEqual([{ type: "text", text: "body" }]);
  });

  it("adfBulletList wraps each item in listItem > paragraph > text", () => {
    const list = adfBulletList(["a", "b"]);
    expect(list.type).toBe("bulletList");
    expect(list.content).toHaveLength(2);
    expect(list.content?.[0]).toEqual({
      type: "listItem",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
      ],
    });
  });

  it("adfBulletList handles empty input", () => {
    const list = adfBulletList([]);
    expect(list.content).toEqual([]);
  });

  it("adfCodeBlock defaults language to text", () => {
    expect(adfCodeBlock("console.log(1)")).toEqual({
      type: "codeBlock",
      attrs: { language: "text" },
      content: [{ type: "text", text: "console.log(1)" }],
    });
  });

  it("adfCodeBlock honors provided language", () => {
    const block = adfCodeBlock("print(1)", "python");
    expect(block.attrs).toEqual({ language: "python" });
  });
});
