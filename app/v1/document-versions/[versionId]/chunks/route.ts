import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import { getAuthorizedVersion } from "@/lib/server/documents";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    z.string().uuid().parse(versionId);
    const user = await requireUser(request);
    const { membership } = await getAuthorizedVersion(versionId, user.id);
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new ApiError(403, "WORKSPACE_ADMIN_REQUIRED", "관리자만 색인 청크를 검수할 수 있습니다.");
    }
    const url = new URL(request.url);
    const { limit, offset } = paginationSchema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    const { data, error } = await createAdminClient().from("document_chunks")
      .select("id,ordinal,content,section_path,page_start,page_end,metadata,token_count,created_at")
      .eq("document_version_id", versionId).order("ordinal").range(offset, offset + limit - 1);
    if (error) throw new ApiError(500, "DATABASE_ERROR", "문서 청크를 조회하지 못했습니다.");
    return Response.json({ chunks: data ?? [], offset, limit });
  } catch (error) {
    return errorResponse(error);
  }
}
