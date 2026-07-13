import { describe, expect, it } from "vitest";

import { countTokens, createStructuralChunks } from "@/lib/rag/chunking";

describe("createStructuralChunks", () => {
  it("carries heading context into embedding text without creating a heading-only chunk", () => {
    const chunks = createStructuralChunks({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      documentTitle: "사업 계획서",
      blocks: [
        { index: 0, type: "heading", level: 1, text: "# 추진 일정", page: 1 },
        { index: 1, type: "paragraph", text: "시범 사업은 3분기에 시작합니다.", page: 2 },
      ],
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("시범 사업은 3분기에 시작합니다.");
    expect(chunks[0].sectionPath).toEqual(["추진 일정"]);
    expect(chunks[0].embeddingText).toContain("문서: 사업 계획서");
    expect(chunks[0].embeddingText).toContain("섹션: 추진 일정");
    expect(chunks[0].pageStart).toBe(2);
  });

  it("splits oversized paragraphs with overlap and never exceeds 700 tokens", () => {
    const text = Array.from({ length: 1200 }, (_, index) => `업무항목${index}`).join(" ");
    const chunks = createStructuralChunks({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      documentTitle: "긴 문서",
      blocks: [{ index: 0, type: "paragraph", text }],
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 700)).toBe(true);
    expect(chunks.every((chunk) => countTokens(chunk.content) === chunk.tokenCount)).toBe(true);
  });

  it("repeats table headers when a table is split", () => {
    const rows = Array.from({ length: 500 }, (_, index) => `| ${index} | 매우 긴 일정 설명 ${index} |`);
    const table = ["| 번호 | 일정 |", "| --- | --- |", ...rows].join("\n");
    const chunks = createStructuralChunks({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      documentTitle: "표 문서",
      blocks: [{ index: 0, type: "table", text: table }],
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.startsWith("| 번호 | 일정 |\n| --- | --- |"))).toBe(true);
    expect(chunks.every((chunk) => chunk.metadata.kind === "table")).toBe(true);
  });
});
