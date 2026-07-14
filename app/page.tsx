import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileSearch,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { AssistantAvatar, BrandLogo } from "@/components/app/brand-assets";

const features = [
  {
    icon: FileSearch,
    title: "근거 기반 답변",
    copy: "업로드된 사내 매뉴얼에서 관련 근거를 먼저 찾고, 답변에 출처를 함께 제공합니다.",
  },
  {
    icon: UploadCloud,
    title: "문서 업로드 자동 처리",
    copy: "PDF 매뉴얼을 업로드하면 텍스트 추출, 청크 생성, 임베딩까지 자동으로 진행합니다.",
  },
  {
    icon: UsersRound,
    title: "사람 답변 요청",
    copy: "문서에 없는 질문은 담당자에게 넘겨 답변하거나, 새 매뉴얼 보강 요청으로 전환합니다.",
  },
  {
    icon: BarChart3,
    title: "운영 인사이트",
    copy: "직원들이 자주 묻는 질문과 문서 공백을 확인해 온보딩 품질을 개선합니다.",
  },
];

const steps = [
  "회사 워크스페이스 생성",
  "매뉴얼 문서 업로드",
  "AI 검색 데이터 생성",
  "직원 질문과 근거 답변",
];

export default function Home() {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="랜딩 페이지 내비게이션">
        <Link className="landing-brand" href="/">
          <BrandLogo className="landing-brand-logo" />
        </Link>
        <div className="landing-nav-links">
          <a href="#features">기능</a>
          <a href="#how-it-works">도입 과정</a>
          <a href="#security">보안</a>
          <Link href="/login?mode=admin&next=/admin">관리자 로그인</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">ONBOARD AI WORKSPACE</p>
          <h1>
            첫날의 질문을
            <br />
            회사의 지식으로 답합니다.
          </h1>
          <p>
            Manualmind는 각 회사의 매뉴얼 문서를 기반으로 신입사원과 구성원의 질문에
            근거 있는 답변을 제공하는 사내 지식 AI 워크스페이스입니다.
          </p>
          <div className="landing-actions">
            <Link className="landing-button primary" href="/login?next=/chat">
              직원으로 시작하기 <ArrowRight size={18} />
            </Link>
            <Link className="landing-button secondary" href="/login?mode=admin&next=/admin">
              관리자 로그인
            </Link>
          </div>
          <div className="landing-proof">
            <span>PRIVATE WORKSPACE</span>
            <span>SOURCE GROUNDED</span>
            <span>SECURE BY DESIGN</span>
          </div>
        </div>

        <div className="landing-hero-visual" aria-label="Manualmind 제품 미리보기">
          <AssistantAvatar variant="full" className="landing-hero-character" />
          <div className="landing-window">
            <div className="landing-window-bar">
              <i />
              <i />
              <i />
              <span>manualmind.app/chat</span>
            </div>
            <div className="landing-chat-preview">
              <div className="landing-chat-user">DRI가 뭐야?</div>
              <div className="landing-chat-ai">
                <AssistantAvatar className="landing-chat-avatar" />
                <div>
                  <strong>DRI는 Directly Responsible Individual의 약자입니다.</strong>
                  <p>여러 명이 협업하더라도 끝까지 책임지는 담당자는 반드시 한 명으로 지정합니다.</p>
                  <small>근거 · NovaLink Labs 사내 업무 매뉴얼 2–3p</small>
                </div>
              </div>
              <div className="landing-citation-card">
                <FileSearch size={16} />
                <span>매뉴얼 근거 2개 검색됨</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-metrics" aria-label="핵심 가치">
        <article>
          <strong>5분</strong>
          <span>문서 업로드 후 검색 데이터 생성 흐름</span>
        </article>
        <article>
          <strong>24/7</strong>
          <span>직원이 언제든 질문할 수 있는 지식 창구</span>
        </article>
        <article>
          <strong>1곳</strong>
          <span>문서, 질문, 담당자 답변을 한 워크스페이스에서 관리</span>
        </article>
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section-head">
          <p className="landing-kicker">FEATURES</p>
          <h2>모든 회사가 자기 매뉴얼만 올리면 바로 쓸 수 있게</h2>
          <p>직원용 질문 경험과 관리자용 문서 운영 경험을 하나의 제품 흐름으로 연결했습니다.</p>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="landing-feature-card">
              <feature.icon size={24} />
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-split-section">
        <article className="landing-interface-card employee">
          <MessageSquareText size={26} />
          <p className="landing-kicker">EMPLOYEE</p>
          <h2>직원용: 질문하고, 근거를 확인하고, 부족하면 요청합니다</h2>
          <p>일반 사원은 매뉴얼 기반 답변을 받고, 필요한 경우 담당자 답변 요청이나 문서 추가 요청을 남길 수 있습니다.</p>
          <Link href="/login?next=/chat">직원 화면으로 이동 <ArrowRight size={16} /></Link>
        </article>
        <article className="landing-interface-card admin">
          <UploadCloud size={26} />
          <p className="landing-kicker">ADMIN</p>
          <h2>관리자용: 최신 문서를 올리고 직원 질문을 운영합니다</h2>
          <p>관리자는 매뉴얼 업로드, 재처리, 구성원 권한, 직원 문의함과 채팅 기록을 관리할 수 있습니다.</p>
          <Link href="/login?mode=admin&next=/admin">관리자 화면으로 이동 <ArrowRight size={16} /></Link>
        </article>
      </section>

      <section className="landing-section landing-steps" id="how-it-works">
        <div className="landing-section-head">
          <p className="landing-kicker">HOW IT WORKS</p>
          <h2>도입부터 답변까지 단순하게</h2>
        </div>
        <ol>
          {steps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-security" id="security">
        <div>
          <p className="landing-kicker">SECURITY</p>
          <h2>회사별 워크스페이스와 역할 권한을 전제로 설계했습니다</h2>
          <p>
            매뉴얼은 회사 워크스페이스 단위로 분리되고, 관리자와 일반 사원의 권한을 나누어
            문서 운영과 질문 경험을 안전하게 분리합니다.
          </p>
        </div>
        <ul>
          <li><ShieldCheck size={18} />회사별 데이터 분리</li>
          <li><LockKeyhole size={18} />관리자 문서 운영 권한</li>
          <li><CheckCircle2 size={18} />답변 근거 추적</li>
        </ul>
      </section>

      <section className="landing-final-cta">
        <p className="landing-kicker">READY TO START</p>
        <h2>이제 매뉴얼을 회사의 답변 시스템으로 바꿔보세요</h2>
        <p>이미 계정이 있다면 바로 로그인해서 직원 화면 또는 관리자 화면으로 이동할 수 있습니다.</p>
        <div className="landing-actions center">
          <Link className="landing-button primary" href="/login?next=/chat">직원 로그인</Link>
          <Link className="landing-button secondary light" href="/login?mode=admin&next=/admin">관리자 로그인</Link>
        </div>
      </section>
    </main>
  );
}
