import "server-only";

import { ApiError } from "@/lib/server/errors";
import { requireWorkspaceMember } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getAuthorizedVersion(versionId: string, userId: string) {
  const admin = createAdminClient();
  const { data: version, error: versionError } = await admin
    .from("document_versions")
    .select("id,document_id,version_number,display_version,replaces_version_id,is_current,original_file_name,content_type,byte_size,storage_object_path,source_sha256,parse_status,parse_metadata,parsing_warnings,processing_error,total_pages,total_chunks,indexed_at,created_at,updated_at")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) throw new ApiError(500, "DATABASE_ERROR", "문서 버전을 조회하지 못했습니다.");
  if (!version) throw new ApiError(404, "VERSION_NOT_FOUND", "문서 버전을 찾을 수 없습니다.");

  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("id,workspace_id,title,owner_id,category,department,effective_date,display_version,description,is_active,archived_at")
    .eq("id", version.document_id)
    .maybeSingle();
  if (documentError) throw new ApiError(500, "DATABASE_ERROR", "문서를 조회하지 못했습니다.");
  if (!document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "문서를 찾을 수 없습니다.");

  const membership = await requireWorkspaceMember(document.workspace_id, userId);
  return { version, document, membership };
}
