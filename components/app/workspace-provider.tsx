"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/client/api";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export interface Workspace { id: string; name: string; role: WorkspaceRole }

interface WorkspaceContextValue {
  workspaces: Workspace[];
  workspace: Workspace | null;
  loading: boolean;
  error: string;
  selectWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "onboard-ai-workspace";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ workspaces: Workspace[] }>("/v1/workspaces");
      setWorkspaces(data.workspaces);
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const next = data.workspaces.some((item) => item.id === saved) ? saved! : data.workspaces[0]?.id ?? "";
      setSelectedId(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "워크스페이스를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectWorkspace = useCallback((id: string) => {
    setSelectedId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }, []);
  const createWorkspace = useCallback(async (name: string) => {
    await api("/v1/workspaces", { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
  }, [refresh]);
  const workspace = workspaces.find((item) => item.id === selectedId) ?? null;
  const value = useMemo(() => ({ workspaces, workspace, loading, error, selectWorkspace, createWorkspace, refresh }),
    [workspaces, workspace, loading, error, selectWorkspace, createWorkspace, refresh]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing");
  return value;
}
