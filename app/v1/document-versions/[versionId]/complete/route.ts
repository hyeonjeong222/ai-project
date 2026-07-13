import path from "node:path";

import { z } from "zod";

import { requireUser } from "@/lib/server/auth";
import { getAuthorizedVersion } from "@/lib/server/documents";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { sha256Hex, validateMagicBytes } from "@/lib/server/files";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    z.string().uuid().parse(versionId);
    const user = await requireUser(request);
    const { version, membership } = await getAuthorizedVersion(versionId, user.id);
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw new ApiError(403, "WORKSPACE_ADMIN_REQUIRED", "관리자만 문서를 처리할 수 있습니다.");
    }

    if (version.parse_status !== "UPLOADING") {
      return Response.json({ versionId, status: version.parse_status, idempotent: true });
    }

    const admin = createAdminClient();
    const { data: file, error: downloadError } = await admin.storage
      .from("knowledge-files")
      .download(version.storage_object_path);
    if (downloadError || !file) throw new ApiError(409, "UPLOAD_NOT_FOUND", "업로드된 파일을 찾을 수 없습니다.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== Number(version.byte_size)) {
      throw new ApiError(409, "FILE_SIZE_MISMATCH", "업로드된 파일 크기가 등록값과 다릅니다.");
    }
    if (sha256Hex(bytes) !== version.source_sha256) {
      throw new ApiError(409, "FILE_HASH_MISMATCH", "업로드된 파일 체크섬이 등록값과 다릅니다.");
    }
    validateMagicBytes(bytes.subarray(0, 512), path.extname(version.original_file_name).toLowerCase());

    const { data, error } = await admin.rpc("queue_document_ingestion", { p_version_id: versionId });
    if (error) throw new ApiError(500, "QUEUE_ERROR", "문서 처리 작업을 등록하지 못했습니다.");
    return Response.json({ versionId, status: data.parse_status ?? "QUEUED" }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
