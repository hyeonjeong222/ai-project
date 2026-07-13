import { z } from "zod";

import { requireUser, requireWorkspaceMember } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ feedback: z.union([z.literal(1), z.literal(-1), z.null()]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await params;
    z.string().uuid().parse(messageId);
    const user = await requireUser(request);
    const input = schema.parse(await request.json());
    const admin = createAdminClient();
    const { data: message, error: messageError } = await admin
      .from("chat_messages")
      .select("id,thread_id,role")
      .eq("id", messageId)
      .maybeSingle();
    if (messageError || !message || message.role !== "ASSISTANT") {
      throw new ApiError(404, "MESSAGE_NOT_FOUND", "평가할 답변을 찾을 수 없습니다.");
    }
    const { data: thread, error: threadError } = await admin.from("chat_threads")
      .select("workspace_id,user_id").eq("id", message.thread_id).single();
    if (threadError || thread.user_id !== user.id) throw new ApiError(403, "MESSAGE_FORBIDDEN", "답변 평가 권한이 없습니다.");
    await requireWorkspaceMember(thread.workspace_id, user.id);
    const { data, error } = await admin.from("chat_messages").update({
      feedback: input.feedback,
      feedback_at: input.feedback === null ? null : new Date().toISOString(),
    }).eq("id", messageId).select("id,feedback,feedback_at").single();
    if (error) throw new ApiError(500, "DATABASE_ERROR", "답변 평가를 저장하지 못했습니다.");
    return Response.json({ message: data });
  } catch (error) {
    return errorResponse(error);
  }
}
