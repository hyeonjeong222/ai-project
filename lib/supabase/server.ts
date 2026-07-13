import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/config/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getServerEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot write cookies; middleware refreshes sessions.
          }
        },
      },
    },
  );
}
