import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "요청 형식이 올바르지 않습니다.", details: error.flatten() } },
      { status: 400 },
    );
  }

  console.error("Unhandled API error", error instanceof Error ? error.message : "unknown");
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다." } },
    { status: 500 },
  );
}

export function assertDatabaseResult(error: { message: string; code?: string } | null): asserts error is null {
  if (error) throw new ApiError(500, "DATABASE_ERROR", "데이터베이스 요청에 실패했습니다.");
}
