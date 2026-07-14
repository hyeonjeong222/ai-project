"use client";

import { CheckCircle2, CircleAlert, FileText, MessageSquareText, Save, Search, ThumbsDown, ThumbsUp } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { PageError, PageLoading } from "@/components/admin/admin-dashboard";
import { AssistantAvatar } from "@/components/app/brand-assets";
import { useWorkspace } from "@/components/app/workspace-provider";
import { api } from "@/lib/client/api";

interface Citation { chunkId: string; documentTitle: string; pageStart: number | null; preview: string; sourceUrl: string }
interface HistoryMessage { id: string; role: "USER" | "ASSISTANT"; content: string; citations: Citation[]; feedback: 1 | -1 | null; created_at: string }
interface Note { id: string; content: string; created_at: string }
interface Session { id: string; title: string | null; updated_at: string; user: { email: string; name: string }; messages: HistoryMessage[]; notes: Note[]; question: string; answer: string; citations: Citation[]; feedback: number | null; answerable: boolean }

export function ChatHistory() {
  const { workspace } = useWorkspace();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (search = "") => {
    if (!workspace) return;
    setLoading(true); setError("");
    try {
      const data = await api<{ sessions: Session[] }>(`/v1/workspaces/${workspace.id}/chat-history?query=${encodeURIComponent(search)}`);
      setSessions(data.sessions);
      setSelectedId((current) => data.sessions.some((item) => item.id === current) ? current : data.sessions[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "채팅 기록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [workspace]);
  useEffect(() => { void load(); }, [load]);
  const selected = sessions.find((item) => item.id === selectedId) ?? null;

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !selected || !note.trim()) return;
    setSaving(true);
    try {
      await api(`/v1/workspaces/${workspace.id}/chat-history/${selected.id}/notes`, { method: "POST", body: JSON.stringify({ content: note.trim() }) });
      setNote(""); await load(query);
    } finally { setSaving(false); }
  }
  async function openSource(citation: Citation) {
    const data = await api<{ url: string }>(citation.sourceUrl);
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  if (loading && sessions.length === 0) return <PageLoading label="관리자 채팅 기록을 불러오는 중입니다." />;
  if (error && sessions.length === 0) return <PageError message={error} onRetry={() => load(query)} />;
  return <div className="admin-page history-page"><header className="page-header"><div><p className="eyebrow">QUALITY REVIEW</p><h1>사용자 채팅 기록</h1><p>질문과 답변, 인용 문서, 만족도를 확인하고 콘텐츠 보완 사항을 기록하세요.</p></div></header>
    <form className="history-search" onSubmit={(event) => { event.preventDefault(); void load(query); }}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="사용자, 이메일 또는 질문 검색" /><button className="button secondary">검색</button></form>
    <section className="history-layout panel"><aside className="history-list"><div className="history-list-title"><strong>채팅 목록</strong><span>{sessions.length}</span></div>{sessions.length === 0 ? <div className="table-empty"><MessageSquareText size={27} /><strong>채팅 기록이 없습니다.</strong></div> : sessions.map((session) => <button className={session.id === selectedId ? "active" : ""} key={session.id} onClick={() => setSelectedId(session.id)}><div><span className="history-avatar">{session.user?.name?.slice(0, 1) || "U"}</span><span><strong>{session.user?.name || "구성원"}</strong><small>{session.user?.email}</small></span>{session.answerable ? <CheckCircle2 className="success-icon" size={17} /> : <CircleAlert className="danger-icon" size={17} />}</div><p>{session.question || session.title || "새 대화"}</p><footer><time>{new Date(session.updated_at).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><span>{session.feedback === 1 ? <><ThumbsUp size={13} /> 만족</> : session.feedback === -1 ? <><ThumbsDown size={13} /> 불만족</> : "미평가"}</span></footer></button>)}</aside>
      <article className="history-detail">{selected ? <><header className="detail-user"><span className="history-avatar large">{selected.user?.name?.slice(0, 1) || "U"}</span><div><h2>{selected.user?.name || "구성원"}</h2><p>{selected.user?.email} · {new Date(selected.updated_at).toLocaleString("ko-KR")}</p></div><span className={`status-badge ${selected.answerable ? "green" : "red"}`}>{selected.answerable ? "근거 답변" : "답변 실패"}</span></header><div className="review-conversation">{selected.messages.map((message) => <div className={`review-message ${message.role.toLowerCase()}`} key={message.id}>{message.role === "ASSISTANT" && <AssistantAvatar />}<div><p>{message.content}</p>{message.citations?.length > 0 && <div className="review-citations">{message.citations.map((citation) => <button key={citation.chunkId} onClick={() => openSource(citation)}><FileText size={16} /><span><strong>{citation.documentTitle}</strong><small>{citation.pageStart ? `${citation.pageStart} 페이지` : "원문"}</small></span></button>)}</div>}</div></div>)}</div><section className="admin-notes"><div className="panel-header"><div><p className="eyebrow">PRIVATE ADMIN NOTES</p><h3>관리자 메모</h3></div><span>직원에게 표시되지 않음</span></div>{selected.notes.length > 0 && <div className="note-history">{selected.notes.map((item) => <p key={item.id}>{item.content}<small>{new Date(item.created_at).toLocaleString("ko-KR")}</small></p>)}</div>}<form onSubmit={saveNote}><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="추가할 문서, 답변 검토 내용 또는 후속 조치를 기록하세요." rows={4} /><button className="button primary" disabled={!note.trim() || saving}><Save size={15} />{saving ? "저장 중…" : "메모 저장"}</button></form></section></> : <div className="detail-empty"><MessageSquareText size={30} /><strong>검토할 대화를 선택해 주세요.</strong></div>}</article>
    </section>
  </div>;
}
