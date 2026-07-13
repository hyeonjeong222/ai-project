import { createHash } from "node:crypto";
import path from "node:path";

import { ApiError } from "@/lib/server/errors";

const allowed = new Map([
  [".hwp", ["application/x-hwp", "application/haansofthwp", "application/octet-stream"]],
  [".hwpx", ["application/hwp+zip", "application/octet-stream", "application/zip"]],
  [".hwpml", ["application/xml", "text/xml"]],
  [".pdf", ["application/pdf"]],
  [".xls", ["application/vnd.ms-excel", "application/octet-stream"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]],
]);

export function sanitizeFileName(value: string) {
  const base = path.basename(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  if (!base || base === "." || base === "..") throw new ApiError(400, "INVALID_FILE_NAME", "파일명이 올바르지 않습니다.");
  return base.slice(0, 240);
}

export function validateDeclaredFile(fileName: string, contentType: string, byteSize: number, maxBytes: number) {
  const extension = path.extname(fileName).toLowerCase();
  const mimeTypes = allowed.get(extension);
  if (!mimeTypes) throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "지원하지 않는 문서 형식입니다.");
  if (!mimeTypes.includes(contentType.toLowerCase())) {
    throw new ApiError(415, "MIME_TYPE_MISMATCH", "확장자와 콘텐츠 형식이 일치하지 않습니다.");
  }
  if (byteSize <= 0 || byteSize > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", `파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`);
  }
  return extension;
}

export function validateMagicBytes(bytes: Uint8Array, extension: string) {
  const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const zip = startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x50, 0x4b, 0x05, 0x06);
  const ole = startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const pdf = startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
  const xml = new TextDecoder().decode(bytes.slice(0, 128)).replace(/^\uFEFF/, "").trimStart().startsWith("<");

  const valid = extension === ".pdf" ? pdf
    : extension === ".hwp" || extension === ".xls" ? ole
      : extension === ".hwpml" ? xml
        : zip;
  if (!valid) throw new ApiError(415, "INVALID_FILE_SIGNATURE", "파일 내용이 확장자와 일치하지 않습니다.");
}

export function sha256Hex(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}
