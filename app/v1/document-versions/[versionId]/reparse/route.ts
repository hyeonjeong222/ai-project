import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import { getAuthorizedVersion } from "@/lib/server/documents";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    z.string().uuid().parse(versionId);
    const user = await requireUser(request);
    const { membership } = await getAuthorizedVersion(versionId, user.id);
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new ApiError(403, "WORKSPACE_ADMIN_REQUIRED", "관리자만 문서 분석을 다시 실행할 수 있습니다.");
    }
    const { data, error } = await createAdminClient().rpc("requeue_document_ingestion", { p_version_id: versionId });
    if (error || !data) throw new ApiError(409, "REPARSE_NOT_AVAILABLE", "현재 상태에서는 문서를 다시 분석할 수 없습니다.");
    return Response.json({ versionId, status: data.parse_status });
  } catch (error) {
    return errorResponse(error);
  }
}
