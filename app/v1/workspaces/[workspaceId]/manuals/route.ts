import { z } from "zod";

import { requireUser, requireWorkspaceMember } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await params;
    z.string().uuid().parse(workspaceId);
    const user = await requireUser(request);
    await requireWorkspaceMember(workspaceId, user.id);

    const admin = createAdminClient();
    const { data: documents, error: documentError } = await admin.from("documents")
      .select("id,title,tags,category,department,effective_date,display_version,description,updated_at")
      .eq("workspace_id", workspaceId).eq("is_active", true).is("archived_at", null)
      .order("updated_at", { ascending: false }).limit(200);
    if (documentError) throw new ApiError(500, "DATABASE_ERROR", "열람 가능한 매뉴얼을 조회하지 못했습니다.");

    const ids = (documents ?? []).map((document) => document.id);
    const { data: versions, error: versionError } = ids.length
      ? await admin.from("document_versions")
        .select("id,document_id,display_version,original_file_name,content_type,byte_size,total_pages,total_chunks,indexed_at")
        .in("document_id", ids).eq("is_current", true).eq("parse_status", "READY")
      : { data: [], error: null };
    if (versionError) throw new ApiError(500, "DATABASE_ERROR", "매뉴얼 버전을 조회하지 못했습니다.");
    const versionByDocument = new Map((versions ?? []).map((version) => [version.document_id, version]));

    return Response.json({
      manuals: (documents ?? []).flatMap((document) => {
        const version = versionByDocument.get(document.id);
        return version ? [{ ...document, version }] : [];
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
