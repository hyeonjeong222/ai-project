"use client";

import { BarChart3, BookOpenText, Building2, ChevronDown, ClipboardList, FilePlus2, Files, LayoutDashboard, LogOut, Menu, MessageSquareText, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";

import { BrandLogo } from "@/components/app/brand-assets";
import { useWorkspace } from "@/components/app/workspace-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const employeeNavigation = [
  { href: "/chat", label: "AI에게 질문", icon: MessageSquareText },
  { href: "/manuals", label: "매뉴얼 열람", icon: BookOpenText },
  { href: "/requests", label: "내 요청", icon: ClipboardList },
];
const adminNavigation = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/documents", label: "문서 관리", icon: Files },
  { href: "/admin/documents/new", label: "최신 매뉴얼 업로드", icon: FilePlus2 },
  { href: "/admin/requests", label: "사원 문의·답변", icon: ClipboardList },
  { href: "/admin/history", label: "채팅 기록", icon: MessageSquareText },
  { href: "/admin/analytics", label: "질문 통계", icon: BarChart3 },
  { href: "/admin/company", label: "회사·구성원", icon: Building2 },
];

export function AppShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  const pathname = usePathname();
  const { workspaces, workspace, loading, error, selectWorkspace, createWorkspace } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const canAdmin = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  async function submitWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    await createWorkspace(name.trim()).finally(() => setCreating(false));
  }
  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    window.location.assign("/login");
  }

  if (loading) return <div className="full-state"><span className="spinner" /><p>워크스페이스를 준비하고 있습니다.</p></div>;
  if (error) return <div className="full-state"><BrandLogo className="state-logo" /><h1>연결을 확인해 주세요</h1><p>{error}</p></div>;
  if (!workspace) return (
    <main className="workspace-setup">
      <div className="setup-card"><BrandLogo className="state-logo" /><p className="eyebrow">COMPANY ADMIN SETUP</p><h1>회사용 지식 공간을 개설해 주세요</h1><p>첫 개설자는 회사 관리자가 됩니다. 이후에는 구성원을 초대해 회사별 문서와 대화를 안전하게 분리합니다.</p>
        <form onSubmit={submitWorkspace}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: ABC Company" maxLength={120} /><button className="button primary" disabled={creating}>{creating ? "개설 중…" : "회사 워크스페이스 개설"}</button></form>
      </div>
    </main>
  );

  const employeeLinks = workspace.role === "VIEWER"
    ? employeeNavigation.filter((item) => item.href === "/manuals")
    : canAdmin
      ? employeeNavigation.filter((item) => item.href !== "/requests")
      : employeeNavigation;
  const navigation = canAdmin ? [...employeeLinks, ...adminNavigation] : employeeLinks;
  return (
    <div className="product-shell">
      {mobileOpen && <button className="mobile-backdrop" aria-label="메뉴 닫기" onClick={() => setMobileOpen(false)} />}
      <aside className={`app-sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-brand"><BrandLogo className="sidebar-logo" /><button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="메뉴 닫기"><X size={19} /></button></div>
        <label className="workspace-select"><span>워크스페이스</span><div><select value={workspace.id} onChange={(event) => selectWorkspace(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div></label>
        <nav className="sidebar-nav" aria-label="주요 메뉴">
          {navigation.map(({ href, label, icon: Icon }, index) => {
            const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return <div key={href}>{index === employeeLinks.length && canAdmin && <p className="nav-section">ADMIN</p>}<Link className={active ? "active" : ""} href={href} onClick={() => setMobileOpen(false)}><Icon size={18} /><span>{label}</span></Link></div>;
          })}
        </nav>
        <div className="sidebar-footer"><div className="user-avatar">{userEmail.slice(0, 1).toUpperCase()}</div><div className="user-copy"><strong>{userEmail.split("@")[0]}</strong><span>{workspace.role}</span></div><button className="icon-button inverse" onClick={signOut} aria-label="로그아웃"><LogOut size={18} /></button></div>
      </aside>
      <div className="product-main">
        <button className="mobile-menu mobile-only" onClick={() => setMobileOpen(true)} aria-label="메뉴 열기"><Menu size={20} /></button>
        {!canAdmin && pathname.startsWith("/admin") ? <main className="admin-access-denied"><BrandLogo className="state-logo" /><p className="eyebrow">ADMIN ONLY</p><h1>관리자 전용 공간입니다</h1><p>문서 업로드·권한 관리·직원 문의 답변은 매뉴얼 관리 담당자만 사용할 수 있습니다. 게시된 매뉴얼 원문은 ‘매뉴얼 열람’ 메뉴에서 확인할 수 있습니다.</p><Link className="button primary" href="/manuals">매뉴얼 열람하기</Link></main> : children}
      </div>
    </div>
  );
}
