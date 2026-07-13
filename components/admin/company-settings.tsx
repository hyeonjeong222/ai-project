"use client";

import { Building2, MailPlus, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { PageError, PageLoading } from "@/components/admin/admin-dashboard";
import { useWorkspace } from "@/components/app/workspace-provider";
import { api } from "@/lib/client/api";

interface Member { user_id: string; role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"; created_at: string; name: string; email: string }
interface Invite { id: string; email: string; role: "ADMIN" | "MEMBER"; created_at: string }

const roleName: Record<Member["role"] | Invite["role"], string> = { OWNER: "회사 관리자", ADMIN: "매뉴얼 관리자", MEMBER: "일반 구성원", VIEWER: "열람 구성원" };

export function CompanySettings() {
  const { workspace } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Invite["role"]>("MEMBER");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true); setError("");
    try {
      const data = await api<{ members: Member[]; invites: Invite[] }>(`/v1/workspaces/${workspace.id}/members`);
      setMembers(data.members); setInvites(data.invites);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "회사 구성원을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [workspace]);
  useEffect(() => { void load(); }, [load]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!workspace || !email.trim()) return;
    setSaving(true); setNotice(""); setError("");
    try {
      await api(`/v1/workspaces/${workspace.id}/members`, { method: "POST", body: JSON.stringify({ email: email.trim(), role }) });
      setEmail(""); setNotice("초대를 등록했습니다. 초대받은 구성원이 해당 이메일로 로그인하면 자동으로 이 회사에 합류합니다.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "초대를 등록하지 못했습니다."); }
    finally { setSaving(false); }
  }

  if (loading && !members.length) return <PageLoading label="회사 설정을 불러오는 중입니다." />;
  if (error && !members.length) return <PageError message={error} onRetry={load} />;
  return <main className="admin-page company-page"><header className="page-header"><div><p className="eyebrow">COMPANY WORKSPACE</p><h1>회사·구성원 관리</h1><p>회사마다 문서와 대화는 완전히 분리됩니다. 이곳에서 매뉴얼 관리자와 일반 구성원을 초대하세요.</p></div></header>
    <section className="company-overview"><article className="panel company-card"><span className="company-icon"><Building2 size={21} /></span><div><p className="eyebrow">COMPANY</p><h2>{workspace?.name}</h2><p>독립된 회사 지식 워크스페이스</p></div></article><article className="panel company-card"><span className="company-icon"><UsersRound size={21} /></span><div><p className="eyebrow">MEMBERS</p><h2>{members.length}명</h2><p>초대 대기 {invites.length}명</p></div></article><article className="panel company-card"><span className="company-icon"><ShieldCheck size={21} /></span><div><p className="eyebrow">DATA BOUNDARY</p><h2>회사별 격리</h2><p>문서·질문·요청이 다른 회사와 분리됩니다.</p></div></article></section>
    <section className="company-layout"><article className="panel invite-card"><div className="panel-header"><div><p className="eyebrow">INVITE MEMBER</p><h2>구성원 초대</h2></div><MailPlus size={21} /></div><p className="muted">초대 이메일을 등록하세요. 해당 계정으로 로그인하면 자동으로 이 회사 워크스페이스에 연결됩니다.</p><form onSubmit={invite}><label className="field-label">회사 이메일<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required /></label><label className="field-label">권한<select value={role} onChange={(event) => setRole(event.target.value as Invite["role"])}><option value="MEMBER">일반 구성원 — AI 질문과 요청만</option><option value="ADMIN">매뉴얼 관리자 — 문서·문의함 관리</option></select></label>{error && <p className="form-alert error">{error}</p>}{notice && <p className="form-alert success">{notice}</p>}<button className="button primary" disabled={saving || !email.trim()}><MailPlus size={16} />{saving ? "등록 중…" : "초대 등록"}</button></form></article>
      <aside className="company-role-guide panel"><p className="eyebrow">ROLE GUIDE</p><h2>권한은 최소한으로</h2><ul><li><ShieldCheck size={16} /><div><strong>회사 관리자</strong><span>구성원과 회사 설정을 관리합니다.</span></div></li><li><Building2 size={16} /><div><strong>매뉴얼 관리자</strong><span>문서 최신화와 직원 답변을 처리합니다.</span></div></li><li><UserRound size={16} /><div><strong>일반 구성원</strong><span>AI 질문과 사람 답변 요청을 사용합니다.</span></div></li></ul></aside></section>
    <section className="panel member-list"><div className="panel-header"><div><p className="eyebrow">ACTIVE MEMBERS</p><h2>현재 구성원</h2></div></div>{members.map((member) => <article key={member.user_id}><span className="member-avatar">{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.email}</small></div><span className={`member-role ${member.role.toLowerCase()}`}>{roleName[member.role]}</span></article>)}</section>
    <section className="panel pending-invites"><div className="panel-header"><div><p className="eyebrow">PENDING INVITES</p><h2>로그인 대기 초대</h2></div><span>{invites.length}명</span></div>{invites.length ? invites.map((invite) => <article key={invite.id}><MailPlus size={16} /><span>{invite.email}</span><strong>{roleName[invite.role]}</strong><small>{new Date(invite.created_at).toLocaleDateString("ko-KR")} 등록</small></article>) : <p className="muted">대기 중인 초대가 없습니다.</p>}</section>
  </main>;
}
