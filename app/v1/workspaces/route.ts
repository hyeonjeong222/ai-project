import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import { errorResponse, ApiError } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const admin = createAdminClient();
    // An invited employee joins the right tenant on first login. This avoids
    // making them create a company workspace just to use the product.
    if (user.email) {
      const { data: pending, error: inviteError } = await admin.from("workspace_invites")
        .select("id,workspace_id,role").eq("email", user.email.toLowerCase()).is("accepted_at", null);
      if (inviteError) throw new ApiError(500, "DATABASE_ERROR", "초대를 확인하지 못했습니다.");
      if (pending?.length) {
        await Promise.all(pending.map(async (invite) => {
          const { error: memberError } = await admin.from("workspace_members").upsert({
            workspace_id: invite.workspace_id, user_id: user.id, role: invite.role,
          }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
          if (memberError) throw memberError;
          const { error: acceptError } = await admin.from("workspace_invites")
            .update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
          if (acceptError) throw acceptError;
        }));
      }
    }
    const { data: memberships, error } = await admin
      .from("workspace_members")
      .select("workspace_id,role")
      .eq("user_id", user.id);
    if (error) throw new ApiError(500, "DATABASE_ERROR", "워크스페이스를 조회하지 못했습니다.");

    const ids = (memberships ?? []).map((item) => item.workspace_id);
    if (ids.length === 0) return Response.json({ workspaces: [] });
    const { data: workspaces, error: workspaceError } = await admin
      .from("workspaces")
      .select("id,name,created_by,created_at,updated_at")
      .in("id", ids)
      .order("created_at");
    if (workspaceError) throw new ApiError(500, "DATABASE_ERROR", "워크스페이스를 조회하지 못했습니다.");

    const roles = new Map((memberships ?? []).map((item) => [item.workspace_id, item.role]));
    return Response.json({ workspaces: (workspaces ?? []).map((item) => ({ ...item, role: roles.get(item.id) })) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = createSchema.parse(await request.json());
    const admin = createAdminClient();
    const { count, error: membershipError } = await admin.from("workspace_members")
      .select("workspace_id", { count: "exact", head: true }).eq("user_id", user.id);
    if (membershipError) throw new ApiError(500, "DATABASE_ERROR", "회사 소속 여부를 확인하지 못했습니다.");
    if ((count ?? 0) > 0) {
      throw new ApiError(403, "COMPANY_CREATION_RESTRICTED", "이미 회사 워크스페이스에 소속되어 있습니다. 새 회사 개설은 별도 관리자 절차가 필요합니다.");
    }
    const { data, error } = await admin.rpc("create_workspace", {
      p_user_id: user.id,
      p_name: input.name,
    });
    if (error || !data) throw new ApiError(500, "DATABASE_ERROR", "워크스페이스를 만들지 못했습니다.");
    return Response.json({ workspace: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
