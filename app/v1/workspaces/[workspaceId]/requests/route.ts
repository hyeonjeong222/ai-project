import { z } from "zod";

import { requireUser, requireWorkspaceAdmin, requireWorkspaceEditor } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({
  kind: z.enum(["HUMAN_ANSWER", "DOCUMENT_REQUEST"]),
  subject: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(4000),
  threadId: z.string().uuid().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    z.string().uuid().parse(workspaceId);
    const user = await requireUser(request);
    const admin = createAdminClient();
    const isAdminView = new URL(request.url).searchParams.get("scope") === "admin";
    if (isAdminView) await requireWorkspaceAdmin(workspaceId, user.id);
    else await requireWorkspaceEditor(workspaceId, user.id);

    let query = admin.from("support_requests")
      .select("id,workspace_id,requester_id,thread_id,kind,subject,content,status,response,responded_by,responded_at,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (!isAdminView) query = query.eq("requester_id", user.id);
    const { data, error } = await query.limit(isAdminView ? 120 : 60);
    if (error) throw new ApiError(500, "DATABASE_ERROR", "문의 요청을 조회하지 못했습니다.");

    const requesterIds = [...new Set((data ?? []).map((item) => item.requester_id))];
    const people = new Map<string, { name: string; email: string }>();
    if (isAdminView) await Promise.all(requesterIds.map(async (id) => {
      const { data: account } = await admin.auth.admin.getUserById(id);
      const email = account.user?.email ?? "알 수 없는 사용자";
      const meta = account.user?.user_metadata as Record<string, unknown> | undefined;
      const name = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : email.split("@")[0];
      people.set(id, { name, email });
    }));
    return Response.json({ requests: (data ?? []).map((item) => ({ ...item, requester: isAdminView ? people.get(item.requester_id) ?? null : undefined })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    z.string().uuid().parse(workspaceId);
    const user = await requireUser(request);
    await requireWorkspaceEditor(workspaceId, user.id);
    const input = createSchema.parse(await request.json());
    const admin = createAdminClient();
    if (input.threadId) {
      const { data: thread, error } = await admin.from("chat_threads").select("id")
        .eq("id", input.threadId).eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
      if (error || !thread) throw new ApiError(403, "THREAD_FORBIDDEN", "내 대화에서만 답변 요청을 만들 수 있습니다.");
    }
    const { data, error } = await admin.from("support_requests").insert({
      workspace_id: workspaceId,
      requester_id: user.id,
      thread_id: input.threadId ?? null,
      kind: input.kind,
      subject: input.subject,
      content: input.content,
    }).select("id,kind,subject,status,created_at").single();
    if (error || !data) throw new ApiError(500, "DATABASE_ERROR", "문의 요청을 등록하지 못했습니다.");
    return Response.json({ request: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
