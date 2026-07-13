"use client";

import { Archive, FilePlus2, FileText, Filter, GitBranch, RefreshCw, Search, ToggleLeft, ToggleRight } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useWorkspace } from "@/components/app/workspace-provider";
import { PageError, PageLoading } from "@/components/admin/admin-dashboard";
import { api } from "@/lib/client/api";
import type { ProductDocument } from "@/lib/client/product-types";

const statuses: Record<string, { label: string; tone: string }> = {
  UPLOADING: { label: "업로드 중", tone: "neutral" }, QUEUED: { label: "분석 대기", tone: "blue" },
  PARSING: { label: "텍스트 추출", tone: "blue" }, CHUNKING: { label: "구조 분석", tone: "blue" },
  EMBEDDING: { label: "검색 데이터 생성", tone: "blue" }, READY: { label: "사용 가능", tone: "green" },
  FAILED: { label: "처리 실패", tone: "red" }, NEEDS_OCR: { label: "OCR 필요", tone: "amber" },
};

function bytes(value: number) { return value < 1024 * 1024 ? `${(value / 1024).toFixed(0)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }

export function DocumentsPage() {
  const { workspace } = useWorkspace();
  const [documents, setDocuments] = useState<ProductDocument[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status) params.set("status", status);
    try { setDocuments((await api<{ documents: ProductDocument[] }>(`/v1/workspaces/${workspace.id}/documents?${params}`)).documents); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [workspace, query, status]);
  useEffect(() => { void load(); }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(document: ProductDocument) {
    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, is_active: !item.is_active } : item));
    try { await api(`/v1/documents/${document.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !document.is_active }) }); }
    catch { setDocuments((current) => current.map((item) => item.id === document.id ? document : item)); }
  }
  async function archive(document: ProductDocument) {
    if (!window.confirm(`“${document.title}” 문서를 보관 처리할까요?`)) return;
    await api(`/v1/documents/${document.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  if (loading && documents.length === 0) return <PageLoading label="문서와 처리 상태를 불러오는 중입니다." />;
  if (error && documents.length === 0) return <PageError message={error} onRetry={load} />;
  return <div className="admin-page"><header className="page-header"><div><p className="eyebrow">KNOWLEDGE LIBRARY</p><h1>매뉴얼 관리</h1><p>AI 답변에 사용되는 회사 매뉴얼과 인덱싱 상태를 관리합니다.</p></div><Link href="/admin/documents/new" className="button primary"><FilePlus2 size={16} />매뉴얼 업로드</Link></header>
    <section className="panel table-panel"><form className="table-toolbar" onSubmit={(event: FormEvent) => { event.preventDefault(); void load(); }}><label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="문서 제목 검색" /></label><label className="select-field"><Filter size={16} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">전체 상태</option><option value="READY">사용 가능</option><option value="QUEUED">분석 대기</option><option value="PARSING">분석 중</option><option value="FAILED">처리 실패</option><option value="NEEDS_OCR">OCR 필요</option></select></label><button className="button secondary" type="submit"><RefreshCw size={15} />조회</button></form>
      <div className="document-table"><div className="table-head"><span>문서</span><span>분류/담당</span><span>처리 상태</span><span>검색 데이터</span><span>사용</span><span /></div>{documents.length === 0 ? <div className="table-empty"><FileText size={28} /><strong>조건에 맞는 문서가 없습니다.</strong><Link href="/admin/documents/new">첫 문서 등록하기</Link></div> : documents.map((document) => { const state = statuses[document.latestVersion?.parse_status ?? "UPLOADING"] ?? { label: document.latestVersion?.parse_status ?? "—", tone: "neutral" }; return <article className="document-row" key={document.id}><div className="document-primary"><span className="file-icon"><FileText size={19} /></span><div><Link className="document-title-link" href={`/admin/documents/${document.id}`}>{document.title}</Link><small>v{document.display_version} · {document.latestVersion?.original_file_name ?? "파일 준비 중"}{document.latestVersion ? ` · ${bytes(document.latestVersion.byte_size)}` : ""}</small></div></div><div><strong className="table-mobile-label">분류</strong><span>{document.category || "미분류"}</span><small>{document.department || "담당 미지정"}</small></div><div><strong className="table-mobile-label">상태</strong><span className={`status-badge ${state.tone}`}>{state.label}</span>{document.latestVersion?.processing_error?.message && <small className="error-copy">{document.latestVersion.processing_error.message}</small>}</div><div><strong className="table-mobile-label">검색 데이터</strong><span>{document.latestVersion?.total_chunks ?? 0} chunks</span><small>{document.latestVersion?.total_pages ? `${document.latestVersion.total_pages} pages` : "페이지 정보 없음"}</small></div><div><button className={`toggle-button ${document.is_active ? "on" : ""}`} onClick={() => toggle(document)} aria-label={document.is_active ? "문서 비활성화" : "문서 활성화"}>{document.is_active ? <ToggleRight size={29} /> : <ToggleLeft size={29} />}<span>{document.is_active ? "활성" : "비활성"}</span></button></div><div className="document-actions"><Link className="icon-button" href={`/admin/documents/new?replace=${document.id}`} aria-label="새 버전 업로드"><GitBranch size={17} /></Link><button className="icon-button" onClick={() => archive(document)} aria-label="문서 보관"><Archive size={17} /></button></div></article>; })}</div>
    </section>
  </div>;
}
