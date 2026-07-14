import { NextResponse } from "next/server";

import { sanitizeInternalRedirect } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeInternalRedirect(url.searchParams.get("next"), url.origin);
  if (code) await (await createSupabaseServerClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(next, url.origin));
}
