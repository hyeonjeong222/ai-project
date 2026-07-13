import "server-only";

import type { User } from "@supabase/supabase-js";

import { ApiError } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    const { data, error } = await createAdminClient().auth.getUser(token);
    if (!error && data.user) return data.user;
  } else {
    const { data, error } = await (await createSupabaseServerClient()).auth.getUser();
    if (!error && data.user) return data.user;
  }

  throw new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
}

export async function requireWorkspaceMember(workspaceId: string, userId: string) {
  const { data, error } = await createAdminClient()
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new ApiError(500, "DATABASE_ERROR", "워크스페이스 권한을 확인하지 못했습니다.");
  if (!data) throw new ApiError(403, "WORKSPACE_FORBIDDEN", "워크스페이스 접근 권한이 없습니다.");
  return data as { role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" };
}

export async function requireWorkspaceEditor(workspaceId: string, userId: string) {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  if (membership.role === "VIEWER") {
    throw new ApiError(403, "WORKSPACE_READ_ONLY", "문서를 변경할 권한이 없습니다.");
  }
  return membership;
}

export async function requireWorkspaceAdmin(workspaceId: string, userId: string) {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw new ApiError(403, "WORKSPACE_ADMIN_REQUIRED", "관리자 권한이 필요합니다.");
  }
  return membership;
}
