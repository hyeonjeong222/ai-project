import { getEncoding } from "js-tiktoken";

import { sha256Hex } from "@/lib/server/files";
import type { PreparedChunk, StructuralBlock } from "@/lib/rag/types";

const encoding = getEncoding("cl100k_base");
const TARGET_TOKENS = 450;
const MAX_TOKENS = 700;
const OVERLAP_TOKENS = 75;

function tokens(text: string) {
  return encoding.encode(text);
}

function normalized(text: string) {
  return text.replace(/\uFFFD/g, "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function tail(text: string, count = OVERLAP_TOKENS) {
  const characters = Array.from(text);
  if (tokens(text).length <= count) return text.trim();
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = characters.slice(mid).join("");
    if (tokens(candidate).length > count) low = mid + 1;
    else high = mid;
  }
  return characters.slice(low).join("").trim();
}

function splitLongSegment(segment: string, maxTokens = MAX_TOKENS) {
  const characters = Array.from(segment);
  const parts: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let low = start + 1;
    let high = characters.length;
    let best = low;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = characters.slice(start, mid).join("");
      if (tokens(candidate).length <= maxTokens) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const part = characters.slice(start, best).join("").trim();
    if (part) parts.push(part);
    start = best;
  }
  return parts;
}

function splitOversizedText(text: string) {
  if (tokens(text).length <= MAX_TOKENS) return [text];
  const segments = text.split(/(\n\n+|(?<=[.!?。！？])\s+)/).filter(Boolean);
  const parts: string[] = [];
  let current = "";
  for (const segment of segments) {
    if (tokens(segment).length > MAX_TOKENS) {
      if (current.trim()) parts.push(current.trim());
      parts.push(...splitLongSegment(segment));
      current = "";
      continue;
    }
    const candidate = [current, segment].filter(Boolean).join("");
    if (current && tokens(candidate).length > MAX_TOKENS) {
      parts.push(current.trim());
      const overlap = tail(current);
      current = [overlap, segment].filter(Boolean).join("\n\n");
    } else {
      current = candidate;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

function splitTable(markdown: string) {
  const lines = markdown.split("\n").filter((line) => line.trim());
  if (tokens(markdown).length <= MAX_TOKENS || lines.length < 4) return [markdown];
  const header = lines.slice(0, 2);
  const rows = lines.slice(2);
  const parts: string[] = [];
  let current = [...header];
  for (const row of rows) {
    const candidate = [...current, row].join("\n");
    if (current.length > 2 && tokens(candidate).length > MAX_TOKENS) {
      parts.push(current.join("\n"));
      current = [...header, row];
    } else {
      current.push(row);
    }
  }
  if (current.length > 2) parts.push(current.join("\n"));
  return parts.flatMap(splitOversizedText);
}

function embeddingText(title: string, sectionPath: string[], pageStart: number | null, content: string) {
  const context = [
    `문서: ${title}`,
    sectionPath.length ? `섹션: ${sectionPath.join(" > ")}` : null,
    pageStart ? `페이지: ${pageStart}` : null,
    "내용:",
    content,
  ];
  return context.filter((value): value is string => Boolean(value)).join("\n");
}

export function createStructuralChunks(input: {
  workspaceId: string;
  documentTitle: string;
  blocks: StructuralBlock[];
}): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  const sectionPath: string[] = [];
  let pending: StructuralBlock[] = [];
  let pendingOverlap = "";
  let activeSectionKey = "";

  const emit = (items: StructuralBlock[], contentOverride?: string, metadata: Record<string, unknown> = {}) => {
    const content = normalized(contentOverride ?? items.map((item) => item.text).join("\n\n"));
    if (!content) return;
    const pages = items.flatMap((item) => item.page ? [item.page] : []);
    const pageStart = pages.length ? Math.min(...pages) : null;
    const pageEnd = pages.length ? Math.max(...pages) : null;
    const pathSnapshot = [...sectionPath];
    const embed = embeddingText(input.documentTitle, pathSnapshot, pageStart, content);
    chunks.push({
      workspaceId: input.workspaceId,
      ordinal: chunks.length,
      content,
      embeddingText: embed,
      contentSha256: sha256Hex(normalized(content)),
      tokenCount: tokens(content).length,
      sectionPath: pathSnapshot,
      pageStart,
      pageEnd,
      blockStart: items.length ? Math.min(...items.map((item) => item.index)) : null,
      blockEnd: items.length ? Math.max(...items.map((item) => item.index)) : null,
      metadata,
    });
  };

  const flush = (keepOverlap: boolean) => {
    if (!pending.length) return;
    const content = pending.map((item) => item.text).join("\n\n");
    emit(pending);
    pendingOverlap = keepOverlap ? tail(content) : "";
    pending = [];
  };

  for (const block of input.blocks) {
    const text = normalized(block.text);
    if (!text || block.type === "image" || block.type === "separator") continue;

    if (block.type === "heading") {
      flush(false);
      const level = Math.max(1, Math.min(block.level ?? 1, 6));
      sectionPath.splice(level - 1);
      sectionPath[level - 1] = text.replace(/^#{1,6}\s*/, "");
      activeSectionKey = sectionPath.join("\u001f");
      continue;
    }

    const sectionKey = sectionPath.join("\u001f");
    if (activeSectionKey !== sectionKey) {
      flush(false);
      activeSectionKey = sectionKey;
    }

    if (block.type === "table") {
      flush(false);
      for (const part of splitTable(text)) emit([block], part, { kind: "table" });
      pendingOverlap = "";
      continue;
    }

    if (tokens(text).length > MAX_TOKENS) {
      flush(false);
      for (const part of splitOversizedText(text)) emit([block], part, { split: true });
      pendingOverlap = "";
      continue;
    }

    const parts = [text];
    for (const [partIndex, part] of parts.entries()) {
      const item = { ...block, text: part };
      const currentText = pending.map((value) => value.text).join("\n\n");
      const prefix = pending.length === 0 && pendingOverlap ? pendingOverlap : "";
      const candidate = [currentText || prefix, part].filter(Boolean).join("\n\n");
      if (pending.length && tokens(candidate).length > MAX_TOKENS) flush(true);
      if (!pending.length && pendingOverlap) {
        pending.push({ ...block, text: pendingOverlap, metadata: { overlap: true } });
        pendingOverlap = "";
      }
      pending.push(item);
      const total = tokens(pending.map((value) => value.text).join("\n\n")).length;
      if (total >= TARGET_TOKENS || parts.length > 1 && partIndex < parts.length - 1) flush(true);
    }
  }
  flush(false);

  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

export function countTokens(text: string) {
  return tokens(text).length;
}
