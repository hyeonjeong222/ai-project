import { performance } from "node:perf_hooks";

import { maximalMarginalRelevance, reciprocalRankFusion, type RawRetrievalHit } from "@/lib/rag/ranking";
import { embedTexts, getOpenAI } from "@/lib/rag/openai";
import { ApiError } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenAIResponseModel } from "@/lib/config/env";

function compactSupabaseError(error: { message: string; code?: string; details?: string; hint?: string } | null) {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

export async function validateDocumentFilters(workspaceId: string, documentIds: string[]) {
  if (!documentIds.length) return;
  const unique = [...new Set(documentIds)];
  const admin = createAdminClient();
  const [{ data, error }, versions] = await Promise.all([
    admin
    .from("documents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .eq("is_active", true)
    .in("id", unique),
    admin
      .from("document_versions")
      .select("document_id")
      .in("document_id", unique)
      .eq("is_current", true)
      .eq("parse_status", "READY"),
  ]);
  if (error || versions.error) throw new ApiError(500, "DATABASE_ERROR", "문서 필터를 확인하지 못했습니다.");
  const readyIds = new Set((versions.data ?? []).map((version) => version.document_id));
  if ((data ?? []).length !== unique.length || readyIds.size !== unique.length) {
    throw new ApiError(403, "DOCUMENT_FILTER_FORBIDDEN", "선택한 문서 중 접근할 수 없는 문서가 있습니다.");
  }
}

export async function rewriteSearchQuery(query: string, history: Array<{ role: string; content: string }>) {
  if (history.length === 0) return query;
  try {
    const context = history.slice(-6).map((item) => `${item.role}: ${item.content}`).join("\n");
    const response = await getOpenAI().responses.create({
      model: getOpenAIResponseModel(),
      instructions: "대화 문맥을 반영해 마지막 질문을 독립적으로 검색 가능한 한 문장으로 바꾸세요. 답변하지 말고 검색문만 출력하세요. 고유명사, 문서명, 조항 번호를 보존하세요.",
      input: `${context}\nUSER: ${query}`,
      store: false,
    });
    const rewritten = response.output_text.trim();
    return rewritten && rewritten.length <= 500 ? rewritten : query;
  } catch {
    console.warn("Search query rewrite failed; using the original query");
    return query;
  }
}

export async function retrieveEvidence(input: {
  workspaceId: string;
  userId: string;
  threadId: string;
  originalQuery: string;
  searchQuery: string;
  documentIds: string[];
}) {
  const startedAt = performance.now();
  await validateDocumentFilters(input.workspaceId, input.documentIds);
  const [queryEmbedding] = await embedTexts([input.searchQuery]);
  const admin = createAdminClient();
  const filters = input.documentIds.length ? [...new Set(input.documentIds)] : null;
  const [vectorResult, lexicalResult] = await Promise.all([
    admin.rpc("match_document_chunks", {
      p_workspace_id: input.workspaceId,
      p_query_embedding: JSON.stringify(queryEmbedding),
      p_match_count: 60,
      p_document_ids: filters,
    }),
    admin.rpc("match_document_chunks_lexical", {
      p_workspace_id: input.workspaceId,
      p_query: input.searchQuery,
      p_match_count: 40,
      p_document_ids: filters,
    }),
  ]);
  if (vectorResult.error || lexicalResult.error) {
    const details = {
      vector: compactSupabaseError(vectorResult.error),
      lexical: compactSupabaseError(lexicalResult.error),
    };
    console.error("Retrieval RPC failed", JSON.stringify(details));
    throw new ApiError(500, "RETRIEVAL_ERROR", "문서 검색에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.", details);
  }

  const vectorHits = (vectorResult.data ?? []) as RawRetrievalHit[];
  const lexicalHits = (lexicalResult.data ?? []) as RawRetrievalHit[];
  const fused = reciprocalRankFusion(vectorHits, lexicalHits);
  const evidence = maximalMarginalRelevance(fused, { limit: 8, lambda: 0.75, maxChunksPerDocument: 3 });
  const latencyMs = Math.round(performance.now() - startedAt);

  const { data: run, error: runError } = await admin.from("retrieval_runs").insert({
    thread_id: input.threadId,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    original_query: input.originalQuery,
    search_query: input.searchQuery,
    embedding_model: "text-embedding-3-small",
    vector_candidate_count: vectorHits.length,
    lexical_candidate_count: lexicalHits.length,
    selected_count: evidence.length,
    latency_ms: latencyMs,
  }).select("id").single();

  if (!runError && run) {
    const selectedIds = new Set(evidence.map((hit) => hit.chunkId));
    const auditRows = fused.map((hit, index) => ({
      retrieval_run_id: run.id,
      chunk_id: hit.chunkId,
      vector_rank: hit.vectorRank ?? null,
      lexical_rank: hit.lexicalRank ?? null,
      fused_rank: index + 1,
      fused_score: hit.fusedScore,
      selected: selectedIds.has(hit.chunkId),
    }));
    const { error } = auditRows.length ? await admin.from("retrieval_run_hits").insert(auditRows) : { error: null };
    if (error) console.error("Retrieval hit audit insert failed", run.id);
  } else {
    console.error("Retrieval run audit insert failed");
  }

  return { evidence, vectorCount: vectorHits.length, lexicalCount: lexicalHits.length, latencyMs };
}
