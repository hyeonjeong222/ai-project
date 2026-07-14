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

const safeDetailKeys: Readonly<Record<string, readonly string[]>> = {
  CHAT_RATE_LIMITED: ["retryAfterSeconds"],
};

function safeApiErrorDetails(error: ApiError) {
  const keys = safeDetailKeys[error.code];
  if (!keys || !error.details || typeof error.details !== "object" || Array.isArray(error.details)) {
    return undefined;
  }

  const details = error.details as Record<string, unknown>;
  const safe = Object.fromEntries(keys.flatMap((key) => {
    const value = details[key];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? [[key, value]]
      : [];
  }));
  return Object.keys(safe).length ? safe : undefined;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    const details = safeApiErrorDetails(error);
    return Response.json(
      { error: { code: error.code, message: error.message, ...(details ? { details } : {}) } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "요청 형식이 올바르지 않습니다.",
          details: { issueCount: error.issues.length },
        },
      },
      { status: 400 },
    );
  }

  console.error("Unhandled API error", error instanceof Error ? error.message : "unknown");
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다." } },
    { status: 500 },
  );
}
