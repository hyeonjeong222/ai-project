import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: z.enum(["ADMIN", "MEMBER"]),
});

async function accountSummary(userId: string) {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  const email = data.user?.email ?? "알 수 없는 사용자";
  const metadata = data.user?.user_metadata as Record<string, unknown> | undefined;
  const name = typeof metadata?.full_name === "string" ? metadata.full_name
    : typeof metadata?.name === "string" ? metadata.name : email.split("@")[0];
  return { name, email };
}

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    z.string().uuid().parse(workspaceId);
    const user = await requireUser(request);
    await requireWorkspaceAdmin(workspaceId, user.id);
    const admin = createAdminClient();
    const [membersResult, invitesResult] = await Promise.all([
      admin.from("workspace_members").select("user_id,role,created_at").eq("workspace_id", workspaceId).order("created_at"),
      admin.from("workspace_invites").select("id,email,role,token,created_at").eq("workspace_id", workspaceId).is("accepted_at", null).order("created_at", { ascending: false }),
    ]);
    if (membersResult.error || invitesResult.error) throw new ApiError(500, "DATABASE_ERROR", "구성원 정보를 조회하지 못했습니다.");
    const members = await Promise.all((membersResult.data ?? []).map(async (item) => ({ ...item, ...(await accountSummary(item.user_id)) })));
    return Response.json({ members, invites: invitesResult.data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    z.string().uuid().parse(workspaceId);
    const user = await requireUser(request);
    await requireWorkspaceAdmin(workspaceId, user.id);
    const input = inviteSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin.from("workspace_invites")
      .select("id").eq("workspace_id", workspaceId).eq("email", input.email).is("accepted_at", null).maybeSingle();
    if (existingError) throw new ApiError(500, "DATABASE_ERROR", "기존 초대를 확인하지 못했습니다.");
    const inviteResult = existing
      ? await admin.from("workspace_invites").update({ role: input.role, invited_by: user.id }).eq("id", existing.id)
        .select("id,email,role,token,created_at").single()
      : await admin.from("workspace_invites").insert({ workspace_id: workspaceId, email: input.email, role: input.role, invited_by: user.id })
        .select("id,email,role,token,created_at").single();
    const { data, error } = inviteResult;
    if (error || !data) throw new ApiError(500, "DATABASE_ERROR", "초대를 만들지 못했습니다.");
    return Response.json({ invite: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
