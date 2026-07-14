import { z } from "zod";

import { getAuthorizedVersion } from "@/lib/server/documents";
import { requireUser } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const { versionId } = await params;
    z.string().uuid().parse(versionId);
    const user = await requireUser(request);
    const { document, membership, version } = await getAuthorizedVersion(versionId, user.id);
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") throw new ApiError(403, "WORKSPACE_ADMIN_REQUIRED", "관리자 권한이 필요합니다.");
    if (version.parse_status !== "UPLOADING") throw new ApiError(409, "UPLOAD_ALREADY_STARTED", "전송이 시작된 문서는 이 방식으로 취소할 수 없습니다.");

    const admin = createAdminClient();
    const { count, error: countError } = await admin.from("document_versions")
      .select("id", { count: "exact", head: true }).eq("document_id", document.id);
    if (countError) throw new ApiError(500, "DATABASE_ERROR", "문서 버전을 확인하지 못했습니다.");
    const result = (count ?? 0) <= 1
      ? await admin.from("documents").delete().eq("id", document.id)
      : await admin.from("document_versions").delete().eq("id", version.id);
    if (result.error) throw new ApiError(500, "DATABASE_ERROR", "실패한 업로드 정보를 정리하지 못했습니다.");
    return Response.json({ cancelled: true });
  } catch (error) {
    return errorResponse(error);
  }
}
