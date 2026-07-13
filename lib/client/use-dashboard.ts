"use client";

import { useCallback, useEffect, useState } from "react";

import { useWorkspace } from "@/components/app/workspace-provider";
import { api } from "@/lib/client/api";
import type { DashboardData } from "@/lib/client/product-types";

export function useDashboardData(range: "7" | "30" | "all" = "30") {
  const { workspace } = useWorkspace();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try { setData(await api<DashboardData>(`/v1/workspaces/${workspace.id}/dashboard?range=${range}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "데이터를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [workspace, range]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}
