import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getServerEnv } from "@/lib/config/env";
import { requireUser, requireWorkspaceAdmin } from "@/lib/server/auth";
import { ApiError, errorResponse } from "@/lib/server/errors";
import { sanitizeFileName, validateDeclaredFile } from "@/lib/server/files";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  title: z.string().trim().min(1).max(500),
  category: z.string().trim().max(80).default(""),
  department: z.string().trim().max(120).default(""),
  effectiveDate: z.string().date().nullable().optional(),
  displayVersion: z.string().regex(/^[0-9]+\.[0-9]+$/),
  description: z.string().trim().max(2000).default(""),
  fileName: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(200),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params;
    z.string().uuid().parse(documentId);
    const user = await requireUser(request);
    const input = schema.parse(await request.json());
    const admin = createAdminClient();
    const { data: document, error: findError } = await admin.from("documents")
      .select("id,workspace_id").eq("id", documentId).is("archived_at", null).maybeSingle();
    if (findError || !document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "교체할 문서를 찾을 수 없습니다.");
    await requireWorkspaceAdmin(document.workspace_id, user.id);

    const env = getServerEnv();
    const fileName = sanitizeFileName(input.fileName);
    const extension = validateDeclaredFile(fileName, input.contentType, input.byteSize, env.RAG_MAX_FILE_BYTES);
    const versionId = randomUUID();
    // Keep Storage keys portable; preserve the user-facing original name in the database.
    const storagePath = `${document.workspace_id}/${documentId}/${versionId}/source${extension}`;
    const { error: registerError } = await admin.rpc("register_document_replacement_upload", {
      p_version_id: versionId,
      p_document_id: documentId,
      p_workspace_id: document.workspace_id,
      p_owner_id: user.id,
      p_title: input.title,
      p_tags: [...new Set(input.tags)],
      p_category: input.category,
      p_department: input.department,
      p_effective_date: input.effectiveDate ?? null,
      p_display_version: input.displayVersion,
      p_description: input.description,
      p_original_file_name: fileName,
      p_content_type: input.contentType,
      p_byte_size: input.byteSize,
      p_storage_object_path: storagePath,
      p_source_sha256: input.sha256,
      p_parser_version: "kordoc-2.9.1",
    });
    if (registerError) throw new ApiError(500, "DATABASE_ERROR", "새 문서 버전을 등록하지 못했습니다.");

    const { data: signed, error: signedError } = await admin.storage
      .from("knowledge-files").createSignedUploadUrl(storagePath, { upsert: false });
    if (signedError || !signed) {
      await admin.from("document_versions").delete().eq("id", versionId);
      throw new ApiError(500, "SIGNED_UPLOAD_ERROR", "업로드 URL을 만들지 못했습니다.");
    }
    return Response.json({ documentId, versionId, upload: { url: signed.signedUrl, token: signed.token, path: storagePath }, expiresIn: 120 }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
