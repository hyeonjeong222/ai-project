import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ content: z.string().trim().min(1).max(4000) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; threadId: string }> },
) {
  try {
    const { workspaceId, threadId } = await params;
    z.string().uuid().parse(workspaceId);
    z.string().uuid().parse(threadId);
    const user = await requireUser(request);
    await requireWorkspaceAdmin(workspaceId, user.id);
    const input = schema.parse(await request.json());
    const admin = createAdminClient();
    const { data: thread, error: threadError } = await admin.from("chat_threads")
      .select("id").eq("id", threadId).eq("workspace_id", workspaceId).maybeSingle();
    if (threadError || !thread) throw new ApiError(404, "THREAD_NOT_FOUND", "대화를 찾을 수 없습니다.");
    const { data, error } = await admin.from("admin_chat_notes").insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      author_id: user.id,
      content: input.content,
    }).select("id,thread_id,content,author_id,created_at,updated_at").single();
    if (error) throw new ApiError(500, "DATABASE_ERROR", "관리자 메모를 저장하지 못했습니다.");
    return Response.json({ note: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
