export type DocumentParseStatus =
  | "UPLOADING" | "QUEUED" | "PARSING" | "NEEDS_OCR" | "CHUNKING"
  | "EMBEDDING" | "READY" | "FAILED" | "DELETED";

export interface Citation {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageStart: number | null;
  pageEnd: number | null;
  sectionPath: string[];
  preview: string;
  sourceUrl: string;
}

export type ChatStreamEvent =
  | { type: "retrieval"; data: { query: string; candidateCount: number; selectedCount: number } }
  | { type: "token"; data: { delta: string } }
  | { type: "citation"; data: Citation }
  | { type: "done"; data: { messageId: string; citations: Citation[] } }
  | { type: "error"; data: { code: string; message: string } };
