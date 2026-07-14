"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { PageLoading } from "@/components/admin/admin-dashboard";
import { useWorkspace } from "@/components/app/workspace-provider";
import { RequestCenter } from "@/components/requests/request-center";

export function RequestsEntry() {
  const router = useRouter();
  const { workspace, loading } = useWorkspace();
  const isAdmin = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  useEffect(() => {
    if (isAdmin) router.replace("/admin/requests");
  }, [isAdmin, router]);

  if (loading || isAdmin) return <PageLoading label="권한에 맞는 문의 화면을 여는 중입니다." />;
  return <RequestCenter />;
}
