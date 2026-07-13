"use client";

import { Bot, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-page" aria-busy="true" />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"password" | "magic" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const managerMode = searchParams.get("mode") === "admin";
  const requestedNext = searchParams.get("next");
  const next = requestedNext?.startsWith("/") ? requestedNext : managerMode ? "/admin" : "/chat";

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading("password");
    setError("");
    const { error: authError } = await createSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (authError) {
      setError("이메일 또는 비밀번호를 확인해 주세요.");
      setLoading(null);
      return;
    }
    window.location.assign(next);
  }

  async function sendMagicLink() {
    if (!email) {
      setError("이메일을 먼저 입력해 주세요.");
      return;
    }
    setLoading("magic");
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: authError } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    if (authError) setError("로그인 링크를 보내지 못했습니다. 관리자에게 계정을 확인해 주세요.");
    else setMessage("메일함에서 Onboard AI 로그인 링크를 확인해 주세요.");
    setLoading(null);
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="서비스 소개">
        <div className="brand-mark brand-mark-large"><Bot size={26} /></div>
        <div>
          <p className="eyebrow light">ONBOARD AI</p>
          <h1>첫날의 질문을<br />회사의 지식으로 답합니다.</h1>
          <p>검증된 사내 문서에서 근거를 찾고, 출처와 함께 빠르게 안내하는 온보딩 워크스페이스입니다.</p>
        </div>
        <div className="login-proof">
          <span>Private workspace</span><span>Source grounded</span><span>Secure by design</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <nav className="login-role-links" aria-label="로그인 유형 선택"><Link className={!managerMode ? "active employee" : ""} href="/login"><UserRound size={14} />일반 사원 로그인</Link><span aria-hidden="true">/</span><Link className={managerMode ? "active manager" : ""} href="/login?mode=admin"><ShieldCheck size={14} />회사 계정 로그인</Link></nav>
          <p className="eyebrow">{managerMode ? "MANUAL ADMIN SIGN IN" : "EMPLOYEE SIGN IN"}</p>
          <h2>{managerMode ? "관리자 계정으로 시작하기" : "회사 계정으로 시작하기"}</h2>
          <p className="muted">{managerMode ? "문서 최신화와 직원 문의 처리는 지정된 매뉴얼 관리 담당자만 할 수 있습니다." : "AI에게 질문하거나, 필요한 매뉴얼과 사람 답변을 요청할 수 있습니다."}</p>
          <form onSubmit={signIn} className="form-stack">
            <label className="field-label">이메일
              <span className="field-shell"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required /></span>
            </label>
            <label className="field-label">비밀번호
              <span className="field-shell"><KeyRound size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" required /></span>
            </label>
            {error && <p className="form-alert error" role="alert">{error}</p>}
            {message && <p className="form-alert success" role="status">{message}</p>}
            <button className="button primary wide" disabled={Boolean(loading)}>{loading === "password" ? "로그인 중…" : "로그인"}</button>
          </form>
          <div className="login-divider"><span>또는</span></div>
          <button className="button secondary wide" type="button" onClick={sendMagicLink} disabled={Boolean(loading)}>
            {loading === "magic" ? "전송 중…" : "이메일 로그인 링크 받기"}
          </button>
          <p className="login-help">이메일 로그인 링크는 비밀번호 대신 이메일로 받은 1회용 로그인 링크로 접속하는 방식입니다. {managerMode ? "관리자 권한이 없으면 직원 화면으로만 접근할 수 있습니다." : "계정이 없다면 회사 관리자에게 초대를 요청하세요."}</p>
        </div>
      </section>
    </main>
  );
}
