import { z } from "zod";

import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chunkId: string }> },
) {
  try {
    const { chunkId } = await params;
    z.string().uuid().parse(chunkId);
    const user = await requireUser(request);
    const admin = createAdminClient();
    const { data: chunk, error: chunkError } = await admin
      .from("document_chunks")
      .select("workspace_id,document_version_id,page_start,page_end")
      .eq("id", chunkId)
      .maybeSingle();
    if (chunkError || !chunk) throw new ApiError(404, "CHUNK_NOT_FOUND", "인용 근거를 찾을 수 없습니다.");
    await requireWorkspaceAdmin(chunk.workspace_id, user.id);

    const { data: version, error: versionError } = await admin
      .from("document_versions")
      .select("storage_object_path,original_file_name")
      .eq("id", chunk.document_version_id)
      .single();
    if (versionError) throw new ApiError(500, "DATABASE_ERROR", "원문 정보를 조회하지 못했습니다.");
    const { data: signed, error: signedError } = await admin.storage
      .from("knowledge-files")
      .createSignedUrl(version.storage_object_path, 60, { download: version.original_file_name });
    if (signedError || !signed) throw new ApiError(500, "SIGNED_URL_ERROR", "원문 URL을 만들지 못했습니다.");

    return Response.json({ url: signed.signedUrl, expiresIn: 60, pageStart: chunk.page_start, pageEnd: chunk.page_end });
  } catch (error) {
    return errorResponse(error);
  }
}
