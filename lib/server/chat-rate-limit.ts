import "server-only";

import { ApiError } from "@/lib/server/errors";
import { createAdminClient } from "@/lib/supabase/admin";

const CHAT_REQUEST_LIMIT = 12;
const CHAT_WINDOW_SECONDS = 60;

interface RateLimitRow {
  allowed: boolean;
  retry_after_seconds: number;
}

export async function enforceChatRateLimit(workspaceId: string, userId: string) {
  const { data, error } = await createAdminClient().rpc("consume_chat_rate_limit", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_limit: CHAT_REQUEST_LIMIT,
    p_window_seconds: CHAT_WINDOW_SECONDS,
  });
  if (error) {
    console.error("Chat rate limit check failed", error.code ?? "unknown");
    throw new ApiError(500, "RATE_LIMIT_CHECK_FAILED", "요청 한도를 확인하지 못했습니다.");
  }

  const result = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
  if (!result?.allowed) {
    throw new ApiError(
      429,
      "CHAT_RATE_LIMITED",
      "질문 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      { retryAfterSeconds: Math.max(1, result?.retry_after_seconds ?? CHAT_WINDOW_SECONDS) },
    );
  }
}
