import type { RetrievalHit } from "@/lib/rag/types";

export interface RawRetrievalHit {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_version_id: string;
  ordinal: number;
  content: string;
  section_path: string[] | null;
  page_start: number | null;
  page_end: number | null;
  metadata: Record<string, unknown> | null;
}

export function reciprocalRankFusion(vectorHits: RawRetrievalHit[], lexicalHits: RawRetrievalHit[], k = 60) {
  const fused = new Map<string, RetrievalHit>();
  const add = (raw: RawRetrievalHit, rank: number, kind: "vector" | "lexical") => {
    const current = fused.get(raw.chunk_id) ?? {
      chunkId: raw.chunk_id,
      documentId: raw.document_id,
      documentTitle: raw.document_title,
      documentVersionId: raw.document_version_id,
      ordinal: raw.ordinal,
      content: raw.content,
      sectionPath: raw.section_path ?? [],
      pageStart: raw.page_start,
      pageEnd: raw.page_end,
      metadata: raw.metadata ?? {},
      fusedScore: 0,
    };
    current.fusedScore += 1 / (k + rank);
    if (kind === "vector") current.vectorRank = rank;
    else current.lexicalRank = rank;
    fused.set(raw.chunk_id, current);
  };

  vectorHits.forEach((hit, index) => add(hit, index + 1, "vector"));
  lexicalHits.forEach((hit, index) => add(hit, index + 1, "lexical"));
  return [...fused.values()].sort((a, b) => b.fusedScore - a.fusedScore);
}

function terms(text: string) {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter((term) => term.length > 1));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((term) => { if (right.has(term)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}

export function maximalMarginalRelevance(
  hits: RetrievalHit[],
  options: { limit?: number; lambda?: number; maxChunksPerDocument?: number } = {},
) {
  const limit = options.limit ?? 8;
  const lambda = options.lambda ?? 0.75;
  const maxPerDocument = options.maxChunksPerDocument ?? 3;
  const remaining = hits.map((hit) => ({ hit, terms: terms(hit.content) }));
  const selected: typeof remaining = [];
  const counts = new Map<string, number>();
  const maxScore = hits[0]?.fusedScore || 1;

  while (selected.length < limit && remaining.length) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      if ((counts.get(candidate.hit.documentId) ?? 0) >= maxPerDocument) return;
      const relevance = candidate.hit.fusedScore / maxScore;
      const redundancy = selected.length
        ? Math.max(...selected.map((item) => jaccard(candidate.terms, item.terms)))
        : 0;
      const score = lambda * relevance - (1 - lambda) * redundancy;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    const [best] = remaining.splice(bestIndex, 1);
    selected.push(best);
    counts.set(best.hit.documentId, (counts.get(best.hit.documentId) ?? 0) + 1);
  }
  return selected.map((item) => item.hit);
}
