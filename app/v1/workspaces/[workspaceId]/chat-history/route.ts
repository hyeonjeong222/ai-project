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
    const { data: threads, error } = await admin.from("chat_threads")
      .select("id,user_id,title,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(80);
    if (error) throw new ApiError(500, "DATABASE_ERROR", "채팅 기록을 조회하지 못했습니다.");
    const ids = (threads ?? []).map((thread) => thread.id);
    const [messageResult, noteResult] = ids.length ? await Promise.all([
      admin.from("chat_messages").select("id,thread_id,role,content,citations,feedback,created_at")
        .in("thread_id", ids).order("created_at"),
      admin.from("admin_chat_notes").select("id,thread_id,content,author_id,created_at,updated_at")
        .in("thread_id", ids).order("created_at", { ascending: false }),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (messageResult.error || noteResult.error) throw new ApiError(500, "DATABASE_ERROR", "채팅 상세를 조회하지 못했습니다.");

    const userIds = [...new Set((threads ?? []).map((thread) => thread.user_id))];
    const users = new Map<string, { email: string; name: string }>();
    await Promise.all(userIds.map(async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      const email = data.user?.email ?? `${userId.slice(0, 8)}…`;
      const metadata = data.user?.user_metadata as Record<string, unknown> | undefined;
      const name = typeof metadata?.full_name === "string" ? metadata.full_name
        : typeof metadata?.name === "string" ? metadata.name : email.split("@")[0];
      users.set(userId, { email, name });
    }));

    const messagesByThread = new Map<string, typeof messageResult.data>();
    for (const message of messageResult.data ?? []) {
      const list = messagesByThread.get(message.thread_id) ?? [];
      list.push(message);
      messagesByThread.set(message.thread_id, list);
    }
    const notesByThread = new Map<string, typeof noteResult.data>();
    for (const note of noteResult.data ?? []) {
      const list = notesByThread.get(note.thread_id) ?? [];
      list.push(note);
      notesByThread.set(note.thread_id, list);
    }
    const search = new URL(request.url).searchParams.get("query")?.trim().toLocaleLowerCase("ko") ?? "";
    const sessions = (threads ?? []).map((thread) => {
      const messages = messagesByThread.get(thread.id) ?? [];
      const lastUser = [...messages].reverse().find((message) => message.role === "USER");
      const lastAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
      return {
        ...thread,
        user: users.get(thread.user_id),
        messages: messages.slice(-20),
        notes: notesByThread.get(thread.id) ?? [],
        question: lastUser?.content ?? "",
        answer: lastAssistant?.content ?? "",
        citations: lastAssistant?.citations ?? [],
        feedback: lastAssistant?.feedback ?? null,
        answerable: Array.isArray(lastAssistant?.citations) && lastAssistant.citations.length > 0,
      };
    }).filter((session) => !search || [session.title, session.user?.name, session.user?.email, session.question]
      .some((value) => value?.toLocaleLowerCase("ko").includes(search)));
    return Response.json({ sessions });
  } catch (error) {
    return errorResponse(error);
  }
}
