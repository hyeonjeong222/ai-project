import { z } from "zod";

import { requireUser, requireWorkspaceAdmin, requireWorkspaceMember } from "@/lib/server/auth";
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
    const url = new URL(request.url);
    const view = z.enum(["chat"]).optional().parse(url.searchParams.get("view") ?? undefined);
    const user = await requireUser(request);
    if (view === "chat") await requireWorkspaceMember(workspaceId, user.id);
    else await requireWorkspaceAdmin(workspaceId, user.id);
    const search = (url.searchParams.get("q") ?? url.searchParams.get("query"))?.trim();
    const category = url.searchParams.get("category")?.trim();
    const admin = createAdminClient();
    let query = admin
      .from("documents")
      .select("id,workspace_id,title,tags,category,department,effective_date,display_version,description,is_active,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (view === "chat") query = query.eq("is_active", true);
    if (search) query = query.ilike("title", `%${search.replace(/[%_]/g, "\\$&")}%`);
    if (category) query = query.eq("category", category);
    const { data: documents, error } = await query;
    if (error) throw new ApiError(500, "DATABASE_ERROR", "문서 목록을 조회하지 못했습니다.");

    const ids = (documents ?? []).map((document) => document.id);
    let versionsQuery = admin
        .from("document_versions")
        .select("id,document_id,version_number,display_version,is_current,original_file_name,content_type,byte_size,parse_status,parsing_warnings,processing_error,total_pages,total_chunks,indexed_at,created_at")
        .in("document_id", ids)
        .order("version_number", { ascending: false });
    if (view === "chat") versionsQuery = versionsQuery.eq("is_current", true).eq("parse_status", "READY");
    const versions = ids.length ? await versionsQuery : { data: [], error: null };
    if (versions.error) throw new ApiError(500, "DATABASE_ERROR", "문서 처리 상태를 조회하지 못했습니다.");
    const latest = new Map<string, (typeof versions.data)[number]>();
    for (const version of versions.data ?? []) {
      const current = latest.get(version.document_id);
      if (!current || (version.is_current && !current.is_current)) latest.set(version.document_id, version);
    }

    const status = url.searchParams.get("status");
    const result = (documents ?? [])
      .map((document) => ({ ...document, latestVersion: latest.get(document.id) ?? null }))
      .filter((document) => view !== "chat" || document.latestVersion !== null)
      .filter((document) => !status || document.latestVersion?.parse_status === status);
    return Response.json({ documents: result });
  } catch (error) {
    return errorResponse(error);
  }
}
