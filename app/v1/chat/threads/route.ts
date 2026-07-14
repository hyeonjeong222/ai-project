import { z } from "zod";

import { requireUser, requireWorkspaceEditor } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    z.string().uuid().parse(workspaceId);
    await requireWorkspaceEditor(workspaceId!, user.id);
    const admin = createAdminClient();
    const { data: threads, error } = await admin
      .from("chat_threads")
      .select("id,workspace_id,user_id,title,created_at,updated_at")
      .eq("workspace_id", workspaceId!)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new ApiError(500, "DATABASE_ERROR", "대화 목록을 조회하지 못했습니다.");
    const ids = (threads ?? []).map((thread) => thread.id);
    const messageResult = ids.length
      ? await admin.from("chat_messages").select("thread_id,content,role,created_at").in("thread_id", ids)
        .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (messageResult.error) throw new ApiError(500, "DATABASE_ERROR", "최근 메시지를 조회하지 못했습니다.");
    const summaries = new Map<string, { count: number; preview: string }>();
    for (const message of messageResult.data ?? []) {
      const current = summaries.get(message.thread_id) ?? { count: 0, preview: "" };
      current.count += 1;
      if (!current.preview) current.preview = message.content.replace(/\s+/g, " ").slice(0, 80);
      summaries.set(message.thread_id, current);
    }
    return Response.json({
      threads: (threads ?? []).map((thread) => ({
        ...thread,
        messageCount: summaries.get(thread.id)?.count ?? 0,
        preview: summaries.get(thread.id)?.preview ?? "",
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceEditor(input.workspaceId, user.id);
    const { data, error } = await createAdminClient().from("chat_threads").insert({
      workspace_id: input.workspaceId,
      user_id: user.id,
      title: input.title ?? null,
    }).select("id,workspace_id,user_id,title,created_at,updated_at").single();
    if (error) throw new ApiError(500, "DATABASE_ERROR", "대화를 만들지 못했습니다.");
    return Response.json({ thread: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
