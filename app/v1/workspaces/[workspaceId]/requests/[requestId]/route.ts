import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const updateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "ANSWERED", "CLOSED"]),
  response: z.string().trim().max(4000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string; requestId: string }> }) {
  try {
    const { workspaceId, requestId } = await params;
    z.string().uuid().parse(workspaceId);
    z.string().uuid().parse(requestId);
    const user = await requireUser(request);
    await requireWorkspaceAdmin(workspaceId, user.id);
    const input = updateSchema.parse(await request.json());
    if (input.status === "ANSWERED" && !input.response) throw new ApiError(400, "RESPONSE_REQUIRED", "답변 내용을 입력해 주세요.");
    const admin = createAdminClient();
    const { data: found, error: findError } = await admin.from("support_requests").select("id")
      .eq("id", requestId).eq("workspace_id", workspaceId).maybeSingle();
    if (findError || !found) throw new ApiError(404, "REQUEST_NOT_FOUND", "문의 요청을 찾을 수 없습니다.");
    const updates: Record<string, unknown> = { status: input.status };
    if (input.response) {
      updates.response = input.response;
      updates.responded_by = user.id;
      updates.responded_at = new Date().toISOString();
    }
    const { data, error } = await admin.from("support_requests").update(updates)
      .eq("id", requestId).select("id,status,response,responded_at,updated_at").single();
    if (error || !data) throw new ApiError(500, "DATABASE_ERROR", "문의 요청을 처리하지 못했습니다.");
    return Response.json({ request: data });
  } catch (error) {
    return errorResponse(error);
  }
}
