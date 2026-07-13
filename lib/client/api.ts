export class ClientApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ClientApiError(response.status, payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "요청을 처리하지 못했습니다.");
  }
  return payload as T;
}
