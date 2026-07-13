import { describe, expect, it } from "vitest";

import { maximalMarginalRelevance, reciprocalRankFusion, type RawRetrievalHit } from "@/lib/rag/ranking";

function hit(chunk: string, document: string, content = chunk): RawRetrievalHit {
  return {
    chunk_id: chunk,
    document_id: document,
    document_title: document,
    document_version_id: `${document}-version`,
    ordinal: 0,
    content,
    section_path: [],
    page_start: 1,
    page_end: 1,
    metadata: {},
  };
}

describe("hybrid ranking", () => {
  it("rewards chunks returned by both retrieval methods", () => {
    const fused = reciprocalRankFusion(
      [hit("vector-only", "a"), hit("both", "b")],
      [hit("both", "b"), hit("lexical-only", "c")],
    );
    expect(fused[0].chunkId).toBe("both");
    expect(fused[0].vectorRank).toBe(2);
    expect(fused[0].lexicalRank).toBe(1);
  });

  it("limits evidence monopolization by a single document", () => {
    const fused = reciprocalRankFusion(
      [hit("a1", "a"), hit("a2", "a"), hit("a3", "a"), hit("a4", "a"), hit("b1", "b")],
      [],
    );
    const selected = maximalMarginalRelevance(fused, { limit: 5, maxChunksPerDocument: 3 });
    expect(selected.filter((item) => item.documentId === "a")).toHaveLength(3);
    expect(selected.some((item) => item.documentId === "b")).toBe(true);
  });
});
