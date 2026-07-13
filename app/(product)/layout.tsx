import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { WorkspaceProvider } from "@/components/app/workspace-provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) redirect("/login");
  return (
    <WorkspaceProvider>
      <AppShell userEmail={user.email ?? "구성원"}>{children}</AppShell>
    </WorkspaceProvider>
  );
}
