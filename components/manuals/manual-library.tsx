"use client";

import { BookOpenText, ChevronLeft, ChevronRight, ExternalLink, FileText, LoaderCircle, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useWorkspace } from "@/components/app/workspace-provider";
import { PageError, PageLoading } from "@/components/admin/admin-dashboard";
import { api } from "@/lib/client/api";

interface ManualSummary {
  id: string;
  title: string;
  tags: string[];
  category: string | null;
  department: string | null;
  effective_date: string | null;
  display_version: string;
  description: string;
  updated_at: string;
  version: { id: string; display_version: string; original_file_name: string; content_type: string; byte_size: number; total_pages: number | null; total_chunks: number; indexed_at: string | null };
}

interface ManualChunk { id: string; ordinal: number; content: string; section_path: string[]; page_start: number | null; page_end: number | null }
interface ManualDetail {
  document: { id: string; title: string; category: string | null; department: string | null; effectiveDate: string | null; displayVersion: string; description: string };
  version: { id: string; fileName: string; contentType: string; totalChunks: number; totalPages: number | null };
  chunks: ManualChunk[];
  sourceUrl: string;
  truncated: boolean;
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function occurrences(value: string, query: string) {
  if (!query) return 0;
  return value.match(new RegExp(escapeRegex(query), "gi"))?.length ?? 0;
}
function HighlightedText({ value, query }: { value: string; query: string }) {
  if (!query) return <>{value}</>;
  const parts = value.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
  return <>{parts.map((part, index) => part.toLocaleLowerCase() === query.toLocaleLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part)}</>;
}

export function ManualLibrary() {
  const { workspace } = useWorkspace();
  const [manuals, setManuals] = useState<ManualSummary[]>([]);
  const [selected, setSelected] = useState<ManualSummary | null>(null);
  const [detail, setDetail] = useState<ManualDetail | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const loadManuals = useCallback(async () => {
    if (!workspace) return;
    setLoading(true); setError("");
    try {
      const data = await api<{ manuals: ManualSummary[] }>(`/v1/workspaces/${workspace.id}/manuals`);
      setManuals(data.manuals);
      setSelected((current) => current && data.manuals.some((manual) => manual.id === current.id) ? current : data.manuals[0] ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "열람 가능한 매뉴얼을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [workspace]);
  useEffect(() => { void loadManuals(); }, [loadManuals]);

  const openManual = useCallback(async (manual: ManualSummary | null) => {
    setSelected(manual); setDetail(null); setFindQuery(""); setMatchIndex(0);
    if (!manual) return;
    setOpening(true); setError("");
    try {
      const data = await api<{ manual: ManualDetail }>(`/v1/document-versions/${manual.version.id}/manual`);
      setDetail(data.manual);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "매뉴얼 본문을 열지 못했습니다."); }
    finally { setOpening(false); }
  }, []);
  useEffect(() => { if (selected) void openManual(selected); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleManuals = useMemo(() => {
    const query = libraryQuery.trim().toLocaleLowerCase();
    if (!query) return manuals;
    return manuals.filter((manual) => [manual.title, manual.description, manual.category, manual.department, ...manual.tags]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(query));
  }, [libraryQuery, manuals]);
  const matches = useMemo(() => detail?.chunks.flatMap((chunk) => {
    const count = occurrences(chunk.content, findQuery.trim());
    return count ? Array.from({ length: count }, () => chunk.id) : [];
  }) ?? [], [detail, findQuery]);
  const activeMatchId = matches[matchIndex] ?? null;

  function moveMatch(direction: 1 | -1) {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    window.document.getElementById(`manual-chunk-${matches[next]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  useEffect(() => { setMatchIndex(0); }, [findQuery]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f" && detail) {
        event.preventDefault();
        window.document.getElementById("manual-find-input")?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detail]);

  if (loading && !manuals.length) return <PageLoading label="열람 가능한 매뉴얼을 준비하는 중입니다." />;
  if (error && !manuals.length) return <PageError message={error} onRetry={loadManuals} />;

  return <main className="manual-page">
    <header className="page-header"><div><p className="eyebrow">COMPANY MANUALS</p><h1>매뉴얼 열람</h1><p>회사에서 게시한 최신 지침을 원문 전체로 읽고, 문서 안에서 필요한 단어를 찾을 수 있습니다.</p></div></header>
    <section className="manual-layout panel">
      <aside className="manual-library">
        <div className="manual-library-head"><div><strong>게시된 매뉴얼</strong><span>{manuals.length}개</span></div><label className="manual-search"><Search size={15} /><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="제목·부서 검색" aria-label="매뉴얼 목록 검색" /></label></div>
        <div className="manual-list">{visibleManuals.length ? visibleManuals.map((manual) => <button key={manual.id} className={selected?.id === manual.id ? "active" : ""} onClick={() => void openManual(manual)}><span className="manual-file-icon"><FileText size={17} /></span><span><strong>{manual.title}</strong><small>{manual.department || manual.category || "전사 공통"} · v{manual.display_version}</small><em>{manual.description || manual.version.original_file_name}</em></span></button>) : <div className="manual-empty"><BookOpenText size={22} /><strong>찾는 매뉴얼이 없습니다.</strong><span>다른 검색어로 다시 찾아보세요.</span></div>}</div>
      </aside>
      <section className="manual-reader">
        {!selected ? <div className="manual-empty reader"><BookOpenText size={30} /><strong>게시된 매뉴얼이 없습니다.</strong><span>관리자가 매뉴얼을 게시하면 이곳에서 전체 내용을 열람할 수 있습니다.</span></div> : opening ? <div className="manual-empty reader"><LoaderCircle className="spin" size={27} /><strong>매뉴얼 원문을 여는 중입니다.</strong></div> : detail ? <>
          <header className="manual-reader-head"><div><p className="eyebrow">{detail.document.department || detail.document.category || "COMPANY POLICY"}</p><h2>{detail.document.title}</h2><p>{detail.document.description || `${detail.version.fileName} 원문`}</p><small>v{detail.document.displayVersion} · {detail.version.totalPages ? `${detail.version.totalPages}페이지` : `${detail.version.totalChunks}개 단락`} · {detail.document.effectiveDate ? `${detail.document.effectiveDate} 시행` : "시행일 미등록"}</small></div><a className="button secondary" href={detail.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />원본 파일 열기</a></header>
          <div className="manual-findbar"><Search size={17} /><input id="manual-find-input" value={findQuery} onChange={(event) => setFindQuery(event.target.value)} placeholder="이 문서에서 단어 찾기 (Ctrl/⌘ + F)" aria-label="문서 내 단어 찾기" />{findQuery && <><span>{matches.length ? `${matchIndex + 1} / ${matches.length}` : "결과 없음"}</span><button aria-label="이전 검색 결과" onClick={() => moveMatch(-1)} disabled={!matches.length}><ChevronLeft size={17} /></button><button aria-label="다음 검색 결과" onClick={() => moveMatch(1)} disabled={!matches.length}><ChevronRight size={17} /></button><button aria-label="검색어 지우기" onClick={() => setFindQuery("")}><X size={16} /></button></>}</div>
          {detail.truncated && <p className="manual-notice">긴 문서의 일부 단락만 표시되고 있습니다. 전체 원문은 ‘원본 파일 열기’로 확인해 주세요.</p>}
          <article className="manual-content" aria-label={`${detail.document.title} 본문`}>{detail.chunks.map((chunk) => <section key={chunk.id} id={`manual-chunk-${chunk.id}`} className={activeMatchId === chunk.id ? "active-match" : ""}>{chunk.section_path.length > 0 && <p className="manual-section">{chunk.section_path.join(" · ")}</p>}<p><HighlightedText value={chunk.content} query={findQuery.trim()} /></p>{chunk.page_start && <small>원문 {chunk.page_start === chunk.page_end || !chunk.page_end ? `${chunk.page_start}페이지` : `${chunk.page_start}–${chunk.page_end}페이지`}</small>}</section>)}</article>
        </> : <div className="manual-empty reader"><BookOpenText size={30} /><strong>매뉴얼을 열지 못했습니다.</strong><span>{error || "잠시 후 다시 시도해 주세요."}</span><button className="button secondary" onClick={() => selected && void openManual(selected)}>다시 시도</button></div>}
      </section>
    </section>
  </main>;
}
