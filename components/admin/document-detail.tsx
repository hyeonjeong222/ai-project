"use client";

import { ArrowLeft, FileSearch, FileText, GitBranch, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageError, PageLoading } from "@/components/admin/admin-dashboard";
import { api } from "@/lib/client/api";

interface Version {
  id: string;
  version_number: number;
  display_version: string;
  replaces_version_id: string | null;
  is_current: boolean;
  original_file_name: string;
  parse_status: string;
  processing_error: { message?: string } | null;
  total_pages: number | null;
  total_chunks: number;
  indexed_at: string | null;
}

interface DocumentDetailData {
  document: {
    id: string; title: string; category: string | null; department: string | null;
    effective_date: string | null; display_version: string; description: string; is_active: boolean;
  };
  versions: Version[];
}

interface Chunk {
  id: string; ordinal: number; content: string; section_path: string[];
  page_start: number | null; page_end: number | null; token_count: number;
}

const labels: Record<string, string> = {
  UPLOADING: "업로드 대기", QUEUED: "분석 대기", PARSING: "텍스트 추출", CHUNKING: "구조 분석",
  EMBEDDING: "검색 데이터 생성", READY: "준비 완료", FAILED: "처리 실패", NEEDS_OCR: "OCR 필요",
};

export function DocumentDetail({ documentId }: { documentId: string }) {
  const [data, setData] = useState<DocumentDetailData | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const next = await api<DocumentDetailData>(`/v1/documents/${documentId}`);
      setData(next);
      setSelectedVersionId((current) => current || next.versions.find((item) => item.is_current)?.id || next.versions[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "문서 상세를 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selectedVersionId) return;
    void (async () => {
      setChunkLoading(true);
      try { setChunks((await api<{ chunks: Chunk[] }>(`/v1/document-versions/${selectedVersionId}/chunks?limit=200`)).chunks); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "색인 청크를 불러오지 못했습니다."); }
      finally { setChunkLoading(false); }
    })();
  }, [selectedVersionId]);

  async function reparse(versionId: string) {
    if (!window.confirm("이 버전을 다시 분석할까요? 분석이 끝날 때까지 일시적으로 검색 대상에서 제외됩니다.")) return;
    setMessage("");
    try {
      const response = await api<{ status: string }>(`/v1/document-versions/${versionId}/reparse`, { method: "POST", body: "{}" });
      setMessage(`재분석 작업을 등록했습니다. 현재 상태: ${labels[response.status] ?? response.status}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "재분석 작업을 등록하지 못했습니다.");
    }
  }

  if (loading) return <PageLoading label="문서 버전과 색인 결과를 불러오는 중입니다." />;
  if (error && !data) return <PageError message={error} onRetry={load} />;
  if (!data) return null;
  const selected = data.versions.find((item) => item.id === selectedVersionId);
  return <div className="admin-page"><header className="page-header"><div><p className="eyebrow">DOCUMENT REVIEW</p><h1>{data.document.title}</h1><p>{data.document.category ?? "미분류"} · {data.document.department ?? "담당 부서 미지정"} · 현재 v{data.document.display_version}</p></div><div className="page-actions"><Link className="button secondary" href="/admin/documents"><ArrowLeft size={16} />문서 목록</Link><Link className="button primary" href={`/admin/documents/new?replace=${documentId}`}><GitBranch size={16} />새 버전 업로드</Link></div></header>
    {error && <p className="form-alert error">{error}</p>}{message && <p className="form-alert success">{message}</p>}
    <section className="panel detail-overview"><div><span>시행일</span><strong>{data.document.effective_date ?? "미지정"}</strong></div><div><span>답변 사용</span><strong>{data.document.is_active ? "활성" : "비활성"}</strong></div><div className="detail-description"><span>설명</span><p>{data.document.description || "등록된 설명이 없습니다."}</p></div></section>
    <section className="panel"><div className="panel-header"><div><p className="eyebrow">VERSION HISTORY</p><h2>버전 및 처리 상태</h2></div></div><div className="version-list">{data.versions.map((version) => <article key={version.id} className={version.id === selectedVersionId ? "version-row selected" : "version-row"}><button className="version-select" onClick={() => setSelectedVersionId(version.id)}><span className={`status-badge ${version.parse_status === "READY" ? "green" : version.parse_status === "FAILED" || version.parse_status === "NEEDS_OCR" ? "red" : "blue"}`}>{labels[version.parse_status] ?? version.parse_status}</span><strong>v{version.display_version}</strong>{version.is_current && <em>현재 검색 버전</em>}<small>{version.original_file_name} · {version.total_chunks} chunks · {version.total_pages ?? "—"} pages</small></button><div className="version-actions"><button className="button ghost compact" onClick={() => void reparse(version.id)} disabled={!['READY', 'FAILED', 'NEEDS_OCR'].includes(version.parse_status)}><RefreshCw size={15} />재분석</button></div>{version.processing_error?.message && <p className="error-copy">{version.processing_error.message}</p>}</article>)}</div></section>
    <section className="panel"><div className="panel-header"><div><p className="eyebrow">INDEX REVIEW</p><h2>{selected ? `v${selected.display_version} 청크 미리보기` : "청크 미리보기"}</h2><p>헤딩 경로와 페이지 정보를 기준으로 색인 결과를 검수합니다.</p></div><FileSearch size={22} /></div>{chunkLoading ? <PageLoading label="청크를 불러오는 중입니다." /> : chunks.length ? <div className="chunk-list">{chunks.map((chunk) => <article key={chunk.id} className="chunk-card"><header><strong>#{chunk.ordinal + 1}</strong><span>{chunk.section_path.join(" › ") || "섹션 정보 없음"}</span><small>{chunk.page_start ? `${chunk.page_start}${chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ""}p` : "페이지 정보 없음"} · {chunk.token_count} tokens</small></header><p>{chunk.content}</p></article>)}</div> : <div className="table-empty"><FileText size={28} /><strong>표시할 청크가 없습니다.</strong><p>분석이 완료된 버전을 선택하거나 재분석 상태를 확인해 주세요.</p></div>}</section>
  </div>;
}
