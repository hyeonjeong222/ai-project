import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    z.string().uuid().parse(workspaceId);
    const user = await requireUser(request);
    await requireWorkspaceAdmin(workspaceId, user.id);
    const admin = createAdminClient();
    const range = z.enum(["7", "30", "all"]).catch("30").parse(new URL(request.url).searchParams.get("range") ?? "30");
    const days = range === "all" ? 30 : Number(range);
    const since = range === "all" ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let threadQuery = admin.from("chat_threads").select("id,user_id,created_at,updated_at").eq("workspace_id", workspaceId);
    let retrievalQuery = admin.from("retrieval_runs").select("id,original_query,selected_count,latency_ms,created_at")
      .eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (since) { threadQuery = threadQuery.gte("created_at", since); retrievalQuery = retrievalQuery.gte("created_at", since); }
    const [documentsResult, threadsResult, retrievalResult] = await Promise.all([
      admin.from("documents").select("id,title,category,is_active,created_at,updated_at").eq("workspace_id", workspaceId).is("archived_at", null),
      threadQuery,
      retrievalQuery,
    ]);
    if (documentsResult.error || threadsResult.error || retrievalResult.error) {
      throw new ApiError(500, "DATABASE_ERROR", "대시보드 데이터를 조회하지 못했습니다.");
    }
    const documentIds = (documentsResult.data ?? []).map((item) => item.id);
    const threadIds = (threadsResult.data ?? []).map((item) => item.id);
    const [versionsResult, feedbackResult, citationResult] = await Promise.all([
      documentIds.length
        ? admin.from("document_versions").select("document_id,parse_status,version_number").in("document_id", documentIds)
          .order("version_number", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      threadIds.length
        ? admin.from("chat_messages").select("feedback").in("thread_id", threadIds).eq("role", "ASSISTANT").not("feedback", "is", null)
        : Promise.resolve({ data: [], error: null }),
      threadIds.length
        ? admin.from("chat_messages").select("citations").in("thread_id", threadIds).eq("role", "ASSISTANT")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (versionsResult.error || feedbackResult.error || citationResult.error) throw new ApiError(500, "DATABASE_ERROR", "대시보드 집계에 실패했습니다.");

    const latestStatus = new Map<string, string>();
    for (const version of versionsResult.data ?? []) {
      if (!latestStatus.has(version.document_id)) latestStatus.set(version.document_id, version.parse_status);
    }
    const retrievals = retrievalResult.data ?? [];
    const feedback = (feedbackResult.data ?? []).flatMap((item) => item.feedback === null ? [] : [Number(item.feedback)]);
    const positive = feedback.filter((value) => value === 1).length;
    const daily = new Map<string, { questions: number; unanswered: number }>();
    for (let offset = Math.min(days, 30) - 1; offset >= 0; offset -= 1) {
      const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      daily.set(day, { questions: 0, unanswered: 0 });
    }
    for (const run of retrievals) {
      const day = run.created_at.slice(0, 10);
      const bucket = daily.get(day);
      if (bucket) {
        bucket.questions += 1;
        if (run.selected_count === 0) bucket.unanswered += 1;
      }
    }
    const latencies = retrievals.flatMap((run) => run.latency_ms === null ? [] : [run.latency_ms]);
    const questions = new Map<string, number>();
    for (const run of retrievals) questions.set(run.original_query, (questions.get(run.original_query) ?? 0) + 1);
    const documentById = new Map((documentsResult.data ?? []).map((item) => [item.id, item]));
    const usage = new Map<string, number>();
    for (const message of citationResult.data ?? []) {
      const citations = Array.isArray(message.citations) ? message.citations : [];
      for (const citation of citations) {
        const record = citation && typeof citation === "object" ? citation as Record<string, unknown> : null;
        const documentId = typeof record?.documentId === "string" ? record.documentId : "";
        if (documentById.has(documentId)) usage.set(documentId, (usage.get(documentId) ?? 0) + 1);
      }
    }
    const documentUsage = [...usage.entries()].map(([documentId, count]) => {
      const document = documentById.get(documentId)!;
      return { documentId, title: document.title, category: document.category, count };
    }).sort((left, right) => right.count - left.count).slice(0, 10);
    const categories = new Map<string, number>();
    for (const item of documentUsage) categories.set(item.category ?? "미분류", (categories.get(item.category ?? "미분류") ?? 0) + item.count);
    return Response.json({
      summary: {
        documents: documentIds.length,
        activeDocuments: (documentsResult.data ?? []).filter((item) => item.is_active).length,
        readyDocuments: [...latestStatus.values()].filter((status) => status === "READY").length,
        conversations: threadIds.length,
        activeUsers: new Set((threadsResult.data ?? []).map((item) => item.user_id)).size,
        questions: retrievals.length,
        unanswered: retrievals.filter((run) => run.selected_count === 0).length,
        satisfaction: feedback.length ? Math.round((positive / feedback.length) * 100) : null,
        averageRetrievalMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
      },
      daily: [...daily.entries()].map(([date, value]) => ({ date, ...value })),
      recentUnanswered: retrievals.filter((run) => run.selected_count === 0).slice(0, 6)
        .map((run) => ({ id: run.id, question: run.original_query, createdAt: run.created_at })),
      categoryDistribution: [...categories.entries()].map(([category, count]) => ({ category, count })).sort((left, right) => right.count - left.count),
      topQuestions: [...questions.entries()].map(([question, count]) => ({ question, count })).sort((left, right) => right.count - left.count).slice(0, 10),
      documentUsage,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
