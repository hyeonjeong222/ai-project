import type { IRBlock } from "kordoc";
import { blocksToMarkdown } from "kordoc";

import type { StructuralBlock } from "@/lib/rag/types";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]) {
  return values.find((value) => typeof value === "string" && value.trim()) as string | undefined;
}

export function adaptKordocBlocks(blocks: IRBlock[]): StructuralBlock[] {
  return blocks.map((block, index) => {
    const record = objectValue(block);
    let markdown = "";
    try {
      markdown = blocksToMarkdown([block]);
    } catch {
      markdown = stringValue(record.markdown, record.text, record.content) ?? "";
    }
    return {
      index,
      type: stringValue(record.type) ?? "paragraph",
      text: markdown,
      level: typeof record.level === "number" ? record.level : undefined,
      page: typeof record.pageNumber === "number" ? record.pageNumber
        : typeof record.page === "number" ? record.page : undefined,
      metadata: record,
    };
  });
}
