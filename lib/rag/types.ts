export interface StructuralBlock {
  index: number;
  type: "heading" | "paragraph" | "list" | "table" | "image" | "separator" | string;
  text: string;
  level?: number;
  page?: number;
  metadata?: Record<string, unknown>;
}

export interface PreparedChunk {
  workspaceId: string;
  ordinal: number;
  content: string;
  embeddingText: string;
  contentSha256: string;
  tokenCount: number;
  sectionPath: string[];
  pageStart: number | null;
  pageEnd: number | null;
  blockStart: number | null;
  blockEnd: number | null;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentVersionId: string;
  ordinal: number;
  content: string;
  sectionPath: string[];
  pageStart: number | null;
  pageEnd: number | null;
  metadata: Record<string, unknown>;
  vectorRank?: number;
  lexicalRank?: number;
  fusedScore: number;
}
