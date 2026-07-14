import { z } from "zod";

import { getAuthorizedVersion } from "@/lib/server/documents";
import { requireUser } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await params;
    z.string().uuid().parse(versionId);
    const user = await requireUser(request);
    const { document, version } = await getAuthorizedVersion(versionId, user.id);
    if (document.archived_at || !document.is_active || !version.is_current || version.parse_status !== "READY") {
      throw new ApiError(404, "MANUAL_NOT_AVAILABLE", "현재 열람할 수 없는 매뉴얼입니다.");
    }

    const admin = createAdminClient();
    const { data: chunks, error: chunkError } = await admin.from("document_chunks")
      .select("id,ordinal,content,section_path,page_start,page_end")
      .eq("document_version_id", version.id).order("ordinal").limit(2000);
    if (chunkError) throw new ApiError(500, "DATABASE_ERROR", "매뉴얼 본문을 불러오지 못했습니다.");
    const { data: signed, error: signedError } = await admin.storage.from("knowledge-files")
      .createSignedUrl(version.storage_object_path, 300);
    if (signedError || !signed) throw new ApiError(500, "SIGNED_URL_ERROR", "원본 파일 URL을 만들지 못했습니다.");

    return Response.json({
      manual: {
        document: { id: document.id, title: document.title, category: document.category, department: document.department, effectiveDate: document.effective_date, displayVersion: document.display_version, description: document.description },
        version: { id: version.id, fileName: version.original_file_name, contentType: version.content_type, totalChunks: version.total_chunks, totalPages: version.total_pages },
        chunks: chunks ?? [],
        sourceUrl: signed.signedUrl,
        truncated: (chunks ?? []).length < version.total_chunks,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
