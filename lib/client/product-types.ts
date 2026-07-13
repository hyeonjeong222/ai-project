export interface DashboardData {
  summary: {
    documents: number;
    activeDocuments: number;
    readyDocuments: number;
    conversations: number;
    activeUsers: number;
    questions: number;
    unanswered: number;
    satisfaction: number | null;
    averageRetrievalMs: number | null;
  };
  daily: Array<{ date: string; questions: number; unanswered: number }>;
  recentUnanswered: Array<{ id: string; question: string; createdAt: string }>;
  categoryDistribution: Array<{ category: string; count: number }>;
  topQuestions: Array<{ question: string; count: number }>;
  documentUsage: Array<{ documentId: string; title: string; category: string | null; count: number }>;
}

export interface ProductDocument {
  id: string;
  title: string;
  tags: string[];
  category: string | null;
  department: string | null;
  effective_date: string | null;
  display_version: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  latestVersion: null | {
    id: string;
    version_number: number;
    display_version: string;
    is_current: boolean;
    original_file_name: string;
    content_type: string;
    byte_size: number;
    parse_status: string;
    total_pages: number | null;
    total_chunks: number;
    processing_error: { message?: string } | null;
    indexed_at: string | null;
  };
}
