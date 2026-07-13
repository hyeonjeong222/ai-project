"use client";

import { CheckCircle2, ClipboardPlus, FilePlus2, MessageCircleQuestion, Send, UserRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { useWorkspace } from "@/components/app/workspace-provider";
import { api } from "@/lib/client/api";

type RequestKind = "HUMAN_ANSWER" | "DOCUMENT_REQUEST";
type RequestStatus = "OPEN" | "IN_PROGRESS" | "ANSWERED" | "CLOSED";
interface SupportRequest { id: string; kind: RequestKind; subject: string; content: string; status: RequestStatus; response: string | null; responded_at: string | null; created_at: string; updated_at: string }

const kindCopy: Record<RequestKind, { label: string; help: string; icon: typeof MessageCircleQuestion }> = {
  HUMAN_ANSWER: { label: "담당자 답변 요청", help: "챗봇이 답하기 어렵거나 정확한 확인이 필요한 내용을 담당자에게 전달합니다.", icon: MessageCircleQuestion },
  DOCUMENT_REQUEST: { label: "매뉴얼 추가 요청", help: "현재 매뉴얼에 없는 정책·절차·안내 문서가 필요할 때 요청합니다.", icon: FilePlus2 },
};
const statusCopy: Record<RequestStatus, string> = { OPEN: "접수됨", IN_PROGRESS: "확인 중", ANSWERED: "답변 완료", CLOSED: "종료" };

export function RequestCenter() {
  const { workspace } = useWorkspace();
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [kind, setKind] = useState<RequestKind>("HUMAN_ANSWER");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try { const data = await api<{ requests: SupportRequest[] }>(`/v1/workspaces/${workspace.id}/requests`); setRequests(data.requests); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "요청 내역을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [workspace]);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !subject.trim() || !content.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await api(`/v1/workspaces/${workspace.id}/requests`, { method: "POST", body: JSON.stringify({ kind, subject: subject.trim(), content: content.trim() }) });
      setSubject(""); setContent(""); setNotice("요청이 접수되었습니다. 담당자가 확인 후 이 화면에 답변을 남깁니다.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "요청을 등록하지 못했습니다."); }
    finally { setSaving(false); }
  }

  const currentKind = kindCopy[kind];
  return <main className="request-page"><header className="page-header"><div><p className="eyebrow">EMPLOYEE REQUEST DESK</p><h1>매뉴얼·답변 요청</h1><p>필요한 정보가 없거나 AI 답변만으로 부족하면 매뉴얼 관리 담당자에게 바로 요청하세요.</p></div></header>
    <section className="request-layout"><article className="panel request-form-card"><div className="panel-header"><div><p className="eyebrow">NEW REQUEST</p><h2>무엇이 필요하신가요?</h2></div><ClipboardPlus size={21} /></div>
      <div className="request-kind-grid">{(Object.keys(kindCopy) as RequestKind[]).map((value) => { const item = kindCopy[value]; const Icon = item.icon; return <button type="button" key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}><Icon size={18} /><strong>{item.label}</strong><span>{item.help}</span></button>; })}</div>
      <form className="request-form" onSubmit={submit}><label className="field-label">요청 제목<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder={kind === "HUMAN_ANSWER" ? "예: 출장비 정산 예외 기준을 확인하고 싶어요" : "예: 재택근무 장비 지원 매뉴얼이 필요해요"} required /></label><label className="field-label">상세 내용<textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={4000} rows={6} placeholder="상황, 확인하고 싶은 내용, 필요한 시점 등을 자세히 적어 주세요." required /></label>{error && <p className="form-alert error">{error}</p>}{notice && <p className="form-alert success">{notice}</p>}<button className="button primary" disabled={saving || !subject.trim() || !content.trim()}><Send size={16} />{saving ? "접수 중…" : `${currentKind.label} 보내기`}</button></form>
    </article>
    <aside className="request-guide panel"><UserRound size={20} /><h2>담당자가 직접 확인합니다</h2><p>매뉴얼 원문은 안전하게 관리됩니다. 요청 내용과 답변은 본인에게만 표시됩니다.</p><ul><li><span>01</span>요청 접수</li><li><span>02</span>담당자 검토</li><li><span>03</span>답변 또는 문서 반영</li></ul></aside></section>
    <section className="panel request-history"><div className="panel-header"><div><p className="eyebrow">MY REQUESTS</p><h2>내 요청 내역</h2></div><span>{requests.length}건</span></div>{loading ? <p className="muted">요청 내역을 불러오는 중입니다.</p> : requests.length === 0 ? <div className="request-empty"><ClipboardPlus size={26} /><strong>아직 등록한 요청이 없습니다.</strong><span>필요한 매뉴얼이나 담당자 답변을 요청해 보세요.</span></div> : <div className="request-list">{requests.map((item) => <article key={item.id}><header><span className={`request-kind ${item.kind.toLowerCase()}`}>{kindCopy[item.kind].label}</span><span className={`request-status ${item.status.toLowerCase()}`}>{item.status === "ANSWERED" && <CheckCircle2 size={13} />}{statusCopy[item.status]}</span></header><h3>{item.subject}</h3><p>{item.content}</p>{item.response && <div className="human-response"><div><UserRound size={15} /><strong>담당자 답변</strong>{item.responded_at && <small>{new Date(item.responded_at).toLocaleString("ko-KR")}</small>}</div><p>{item.response}</p></div>}<time>{new Date(item.created_at).toLocaleString("ko-KR")}</time></article>)}</div>}</section>
  </main>;
}
