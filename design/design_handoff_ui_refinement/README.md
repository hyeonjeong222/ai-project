# Handoff: Onboard AI — 디자인 고도화 (레이아웃·버튼·가독성)

## Overview
사내 온보딩 RAG 챗봇 "Onboard AI"(Next.js 15 + `app/globals.css` 단일 스타일시트)의 기존 UI를 유지하면서 디테일을 다듬는 고도화 작업입니다. 범위: 버튼 위계/크기 통일, hover·active·focus 상태 피드백, 컨트롤 높이 정렬, 페이지 간 간격·정렬 일관화, 최소 폰트 크기 상향(가독성).

## About the Design Files
이 번들의 HTML 파일들은 **HTML로 제작된 디자인 레퍼런스(프로토타입)**입니다. 그대로 배포하는 코드가 아니라, **대상 코드베이스(Next.js 15 / React 19 / `app/globals.css`)의 기존 패턴 위에 재구현**해야 합니다. 이 프로젝트는 클래스 기반 단일 CSS(`app/globals.css`)를 쓰므로, 구현 방법은 아래 "구현 방법"의 CSS 병합이 전부입니다 — 컴포넌트(TSX) 수정은 필요 없습니다.

## Fidelity
**High-fidelity.** `assets/onboard.css`는 원본 `app/globals.css`의 사본이며, 마크업은 실제 컴포넌트(`components/**/*.tsx`)의 클래스 구조를 그대로 재현했습니다. 색·타이포·간격 값은 픽셀 단위로 신뢰해도 됩니다.

## 구현 방법 (핵심)
`assets/refined.css`가 개선안 전체입니다. 원본 CSS 위에 얹는 오버라이드로 작성되어 있습니다.

1. `refined.css`의 규칙을 `app/globals.css`의 해당 기존 규칙에 **병합**하세요 (`.uiv2 ` 접두사는 제거).
2. 변형 셀렉터는 채택 여부에 따라 처리:
   - `[data-density="comfortable"|"compact"]` — 밀도 변형. 하나를 채택하면 그 값들을 기본 규칙에 병합, 미채택 시 삭제.
   - `[data-read="lg"]` — 가독성 강화 변형. 동일하게 처리.
   - `[data-btn="soft"]` — 버튼 소프트 섀도 변형. 동일하게 처리.
3. TSX 변경 없음. 모든 셀렉터는 기존 클래스명을 그대로 사용합니다.

## Screens / Views
프로토타입(`Onboard AI (개선 v2).dc.html`)은 사이드바 내비게이션으로 전 화면을 오갈 수 있는 단일 파일입니다. 포함 화면: 로그인, 채팅(AI에게 질문), 내 요청, 관리자 대시보드, 문서 관리, 매뉴얼 업로드(작업 선택 → 폼 → 진행 → 완료), 직원 문의함, 채팅 기록, 질문 통계, 회사·구성원. 각 화면 레이아웃은 원본과 동일하며(변경 없음), 아래 "변경 명세"의 디테일만 다릅니다.

## 변경 명세 (원본 → 개선)

### 1. 버튼 시스템 (`.button`)
- 높이: `min-height 40px` → **38px** 로 단일화. `compact`는 30px → **32px**, 사이드 링크(`.request-link`)는 35px → **34px**.
- 라운드: 9px → **8px** (soft 변형: 10px).
- 패딩/타이포: `0 15px / 13px 750` → **`0 16px` / 13px 650**, `gap 8px → 7px`.
- hover 시 `translateY(-1px)` 리프트 **제거**, 대신 배경/보더/섀도 전환. `:active`에 `translateY(1px)` + 진한 배경(`primary: #05438f`).
- primary: 상시 섀도 제거 → hover에서만 `0 4px 12px rgba(7,88,189,.22)` (배경 `#064ea9`).
- secondary: 텍스트 `#334155` → `var(--ink) #142033`, hover `border #9db0c6 / bg #f4f7fa`, active `bg #edf1f6`.
- ghost: hover `bg #eef2f7 / color var(--ink)`.
- `.icon-button`: 36px → **34px**, radius 9px → 8px, active `bg #e2e9f1`.
- focus-visible: `outline 2px solid rgba(39,128,238,.5); outline-offset 2px` 로 통일.

### 2. 컨트롤 높이 정렬
- `.search-field`, `.select-field`: min-height 39px → **38px**, 내부 폰트 11px/10px → **12px**.
- `.range-switch button`: 31px → **34px**, 폰트 9px → **11px**.
- `.workspace-select select`: 39px → **38px**.
- `.field-label input/select`: 43px → **42px**, radius 9px → 8px.
- 채팅 전송 버튼: hover `#064ea9`, active `translateY(1px)` 추가.

### 3. 상태 피드백
리스트형 버튼(`.thread-item`, `.history-list>button`, `.inbox-list>button`, `.suggestion-grid button`, `.request-kind-grid button`, `.upload-mode-card`)에 `transition: background/border-color/box-shadow .15s ease`. `.toggle-button` hover 색 피드백. 사이드바 링크 active 상태 추가.

### 4. 정렬·간격
- `.page-header`: `align-items flex-start → center`, `margin-bottom 25px → 26px`, `h1 25px → 24px`.
- `.action-panel` 패딩 20 → 22px.
- `.invite-card form`: `1fr 240px auto` → **`1fr 220px auto` + gap 12px** (좁은 화면에서 권한 셀렉트가 찌그러지는 문제 완화).
- `.metric-grid`/`.dashboard-grid`/`.analytics-grid` gap 13/15px → **14px** 통일.
- `.messages-inner` gap 22 → 24px, `.thread-rail` 패딩 20/14 → 18/14.

### 5. 가독성 (최소 폰트 상향 — 기본 적용)
7–9px 마이크로 텍스트를 한 단계씩 상향. 대표값:
- `.eyebrow` 10 → 10.5px, `.status-badge` 8 → 9.5px(높이 23→24px, 패딩 0 8→9px)
- 테이블/리스트 본문 11 → **12px**, 보조(small) 8–9 → **9.5–10px**
- `.composer-meta`, `.answer-actions` 9 → 10.5px, `.chart-legend`/`.data-chip` 9 → 10px
- `.review-message p` 10 → 11.5px, `.request-list p` 10 → 11px, `.usage-panel` 10 → 11px
- 전체 목록은 `refined.css` 5번 섹션 참고 (값은 파일이 기준).

### 6. 변형(선택지)
- **밀도**: 기본 / 여유(comfortable: admin-page 패딩 40px, metric-card 128px/22px, document-row 86px) / 조밀(compact: 패딩 24px, metric-card 96px/15px, document-row 62px, h1 21px).
- **가독성 강화(lg)**: 채팅 말풍선 13 → 14px(행간 1.8), 테이블 본문 13px, metric 값 24 → 26px 등.
- **버튼 소프트 섀도(soft)**: radius 10px + primary 상시 섀도 유지형.

## Interactions & Behavior
- 내비게이션: 사이드바 링크로 화면 전환, active 항목은 `rgba(30,112,229,.18)` 배경 + `#55a0ff` 좌측 3px 바.
- 채팅: 전송 → 사용자 말풍선 즉시, 어시스턴트 답변 스트리밍(커서 blink `.streaming::after`), 인용 카드(`citation-safe`), 답변 평가 토글(만족 green `#059669` soft / 불만족 red `#dc3d4b` soft).
- 업로드: 작업 선택 → 파일 선택 → 체크리스트 충족 시 제출 활성화 → 6단계 진행(`ingestion-steps`, 단계당 current=blue/done=green) → 완료 카드.
- 문서 토글: 활성/비활성 낙관적 업데이트. 문의함: 상태 셀렉트가 ANSWERED일 때만 답변 필수.
- 전환은 모두 `.15s ease` (버튼 active만 `.1s`).

## State Management
기존 컴포넌트 상태 그대로 사용 (변경 없음). 프로토타입의 상태는 데모용입니다.

## Design Tokens (원본 유지)
- Navy: `--navy-950 #03142f`, `--navy-900 #071b39`, `--navy-800 #102a50`
- Blue: `--blue-700 #0758bd`, `--blue-600 #0b68df`, `--blue-500 #2780ee`, `--blue-100 #dceaff`, `--blue-50 #eff6ff`
- Ink/Text: `--ink #142033`, `--muted #68758a`, `--soft #929caf`
- Surface: `--canvas #f5f7fa`, `--surface #fff`, `--surface-soft #f8fafc`, `--line #dfe5ec`, `--line-strong #cbd4df`
- Semantic: green `#059669/#e7f8f1`, red `#dc3d4b/#fff0f1`, amber `#b66b08/#fff7e5`
- Shadow: `0 1px 2px rgba(8,24,48,.04), 0 12px 30px rgba(8,24,48,.045)` / Radius: `--radius 12px` / Sidebar: 248px
- Font: Pretendard Variable (유지)
- 신규 상태 값: hover 섀도 `0 4px 12px rgba(7,88,189,.22)`, active bg `#05438f`(primary)·`#edf1f6`(secondary)·`#e2e9f1`(icon), focus ring `rgba(39,128,238,.5)`

## Assets
- 아이콘: lucide (기존 lucide-react 0.468과 동일). 프로토타입은 lucide UMD + `assets/l-icon.js` 웹컴포넌트로 렌더 — 실제 앱은 기존 lucide-react 그대로.
- 폰트: Pretendard Variable (CDN).

## Files
- `Onboard AI (개선 v2).dc.html` — 개선안 인터랙티브 프로토타입 (전 화면, 밀도/가독성/버튼 변형 포함)
- `Onboard AI (현재 UI).dc.html` — 현재 UI 재현본 (비교 기준)
- `assets/refined.css` — **구현 대상: 개선안 오버라이드 전체**
- `assets/onboard.css` — 원본 `app/globals.css` 사본 (참조용)
- `assets/l-icon.js` — 프로토타입용 아이콘 헬퍼 (구현 불필요)
