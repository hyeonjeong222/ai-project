# 온보딩 RAG 챗봇 팀 Git 워크플로우

> 대상: 6명, Next.js 15 + Supabase + RAG 워커를 하나의 모노레포로 개발하는 팀  
> 원칙: `main`은 항상 배포 가능한 상태로 유지하고, 모든 변경은 작은 PR 하나를 통해서만 합친다.

## 1. 역할과 폴더 오너십

| 역할 | 주 소유 영역 | 브랜치 예시 | 기본 리뷰어 |
| --- | --- | --- | --- |
| FE ① 챗 | `app/(chat)`, `components/chat` | `feat/chat-streaming-ui` | FE ② |
| FE ② 문서 | `app/(admin)/documents`, `components/documents` | `feat/documents-upload-status` | FE ① |
| FE ③ 기록 | `app/(admin)/history`, `components/history` | `feat/history-message-table` | FE ④ |
| FE ④ 통계 | `app/(admin)/analytics`, `components/analytics` | `feat/analytics-kpi-cards` | FE ③ |
| BE/API | 인증, API route/서버 서비스, API 계약 | `feat/api-document-upload` | RAG |
| RAG/Infra | 파싱 워커, 청킹·검색, Supabase 벡터/RLS | `feat/rag-hybrid-retrieval` | BE/API |

공통 영역인 `components/ui`, `lib/types`, `package.json`, CI 설정, `supabase/migrations`는 수정 전에 팀 채널에 먼저 알린다. 특히 `supabase/migrations`는 BE/API와 RAG/Infra만 작성하고 서로 리뷰한다. 이미 머지된 migration 파일은 절대 수정하지 않고, 항상 새 migration으로 변경한다.

현재 초기 설계 파일은 다음과 같다.

- `docs/rag-architecture.md`: 업로드·청킹·임베딩·검색 설계
- `supabase/migrations/202607130001_knowledge_rag.sql`: Storage, RLS, pgvector, 검색 RPC

## 2. 최초 1회: 저장소 관리자 설정

저장소 생성 담당자는 다음을 실행해 최초 구조를 `main`에 올린다.

```bash
git init
git branch -M main
git remote add origin https://github.com/ainowax/onboarding-rag-chatbot.git
git add .
git commit -m "chore: 프로젝트 초기 세팅"
git push -u origin main
```

GitHub의 **Settings → Rules → Rulesets**에서 `main` 규칙을 만든다.

1. Pull request 없이 merge 금지
2. 승인 1명 이상 필수
3. 대화(Conversation) 해결 필수
4. 상태 검사 `lint`, `typecheck`, `test`가 준비되면 모두 필수로 지정
5. force push와 main 직접 push 금지
6. merge 방식은 **Squash and merge만 허용**, merge 뒤 브랜치 자동 삭제

`develop` 브랜치는 만들지 않는다. 6명 규모에서는 짧게 사는 기능 브랜치 → PR → `main` 흐름이 가장 단순하고, 통합 상태도 한 곳에서 확인할 수 있다.

## 3. 각 팀원 최초 1회

```bash
git clone https://github.com/ainowax/onboarding-rag-chatbot.git
cd onboarding-rag-chatbot
npm ci
copy .env.example .env.local

# pull 시 의도하지 않은 merge commit을 만들지 않도록 설정
git config pull.ff only
git config rerere.enabled true
```

PowerShell에서는 `copy`를 사용하고, macOS/Linux에서는 `cp .env.example .env.local`을 사용한다. `package-lock.json`이 아직 없는 초기 단계만 `npm install`을 쓴다.

`.env.local`에는 Supabase URL/anon key, 서버의 `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` 등을 채운다. `.env.local`, `.env`, 키가 포함된 로그·스크린샷은 어떤 경우에도 커밋하거나 PR에 붙이지 않는다.

## 4. 작업 시작: 최신 main에서 브랜치 만들기

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/rag-kordoc-worker
```

브랜치 이름은 다음 접두어를 사용한다.

| 종류 | 규칙 | 예시 |
| --- | --- | --- |
| 챗 화면 | `feat/chat-*` | `feat/chat-citation-cards` |
| 문서 화면 | `feat/documents-*` | `feat/documents-upload-form` |
| 기록/통계 | `feat/history-*`, `feat/analytics-*` | `feat/history-search-filter` |
| 서버 API | `feat/api-*` | `feat/api-ingestion-status` |
| RAG | `feat/rag-*` | `feat/rag-embedding-retry` |
| DB/운영 | `chore/supabase-*`, `chore/ci-*` | `chore/supabase-chat-tables` |
| 버그 | `fix/<area>-*` | `fix/rag-duplicate-chunks` |
| 문서 | `docs/*` | `docs/team-workflow` |

브랜치는 개인 작업용이다. 다른 사람 브랜치에 직접 push하지 않는다. 한 PR은 화면 하나, API 하나, 또는 RAG 파이프라인의 한 단계처럼 독립적으로 검토 가능한 크기로 유지하고, 작업 기간은 원칙적으로 2~3일을 넘기지 않는다.

## 5. 개발 중 규칙

### API와 타입 변경

API 응답/요청 타입을 바꾸면 같은 PR에 서버 구현, 타입, 호출부, 오류 처리, 테스트를 같이 넣는다. FE가 mock으로 먼저 개발해야 한다면 API 담당자가 타입과 예시 payload를 먼저 공유하고, mock 제거 PR은 별도로 작게 만든다.

### Supabase migration

스키마 변경은 Dashboard에서 수동으로만 하지 않는다. 새 SQL 파일로 기록한다.

```bash
supabase migration new add_document_tags
# 생성된 supabase/migrations/<timestamp>_add_document_tags.sql 을 편집

# 로컬 Supabase를 쓰는 환경에서만 실행한다. 원격 DB에는 실행하지 않는다.
supabase db reset
```

- migration 파일명에는 기능을 적는다.
- 머지된 migration을 고치지 않는다. 수정은 새 migration으로 한다.
- RLS를 켠 테이블에는 같은 PR에서 필요한 정책과 인덱스를 함께 추가한다.
- 벡터 차원·임베딩 모델을 바꾸는 변경은 기존 벡터와 섞지 않는다. 새 재색인 계획을 PR 설명에 적고 BE/RAG 상호 승인을 받는다.
- 같은 날 migration을 두 명이 작성하면, 먼저 열린 PR의 timestamp를 기준으로 충돌을 해소한다. 번호를 임의로 맞추기보다 최신 `main`을 병합한 뒤 새 파일로 다시 만든다.

### 문서 업로드/RAG 보안

- `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`는 API 서버와 워커에서만 사용한다. 클라이언트 코드에는 anon key만 둔다.
- private `knowledge-files` 버킷의 원본과 `document_chunks` 원문을 브라우저에서 직접 조회하게 만들지 않는다.
- RAG 프롬프트·파서 경고·업로드 오류에 원문 비밀정보나 키를 로그로 남기지 않는다.

## 6. 커밋하고 push하기

```bash
git status
git diff --check
git add 'app/(chat)' components/chat lib/chat
git commit -m "feat(chat): 스트리밍 답변과 출처 카드 추가"
git push -u origin feat/chat-streaming-ui
```

PowerShell과 Bash 모두 괄호가 포함된 경로는 따옴표로 감싼다.

```powershell
git add 'app/(chat)' components/chat lib/chat
```

`git add .`은 환경파일·다른 사람의 변경을 같이 올릴 위험이 있어 사용하지 않는다. 커밋 메시지는 다음 형식으로 통일한다.

```text
feat(chat): 출처 카드 추가
fix(rag): 중복 청크 재시도 방지
chore(supabase): retrieval audit 테이블 추가
refactor(api): 업로드 서비스 분리
docs: 팀 Git 워크플로우 추가
```

push 전에 해당 영역의 검증을 실행한다. 스크립트가 준비된 뒤에는 최소 아래를 기준으로 한다.

```bash
npm run lint
npm run typecheck
npm test
```

## 7. PR 생성·리뷰·머지

push 뒤 GitHub의 **Compare & pull request**로 PR을 만들고, 저장소의 PR 템플릿을 빠짐없이 작성한다.

- PR 제목은 커밋과 같은 Conventional Commit 형식을 쓴다.
- 최소 리뷰어 1명을 지정한다. 역할 표의 기본 리뷰어가 우선이다.
- UI 변경에는 전/후 스크린샷 또는 짧은 영상, API/RAG 변경에는 요청·응답 예시와 테스트 방법을 넣는다.
- migration, RLS, 환경변수, API 계약 변경은 BE와 RAG 중 최소 한 명이 반드시 확인한다.
- CI 성공과 승인 뒤에만 **Squash and merge**한다. PR 작성자가 자신의 PR을 단독으로 merge하지 않는다.

머지 후 GitHub에서 브랜치를 삭제한다. 로컬 브랜치는 다음처럼 정리한다.

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/chat-streaming-ui
```

## 8. 다른 PR이 머지됐을 때 동기화

작업 중인 브랜치는 하루에 한 번, 그리고 통합 주간에는 main 머지 직후 동기화한다.

```bash
git switch main
git pull --ff-only origin main
git switch feat/내-작업-브랜치
git merge main
```

이 프로젝트의 기본 방식은 `merge main`이다. 이미 push한 브랜치를 습관적으로 rebase하지 않아 리뷰 diff와 팀원의 로컬 상태를 흔들지 않는다. 아직 리뷰 전인 개인 브랜치에서 꼭 rebase가 필요하다면 다음만 허용한다.

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

`git push --force`는 금지한다. 충돌이 나면 `git status`로 파일을 확인하고, 오너와 먼저 조율한 뒤 해결한다. 공통 타입, migration, `components/ui` 충돌을 혼자 의미 변경하며 해결하지 않는다.

```bash
# 충돌 해결 후
git add <해결한-파일>
git commit
git push
```

## 9. 4주차 통합 주간 규칙

mock → 실제 API 전환 기간에는 다음을 추가로 지킨다.

1. API/RAG 변경 PR은 mock 제거와 서버 계약 변경을 한 PR에 섞지 않는다.
2. `main`에 merge되면 작업 중인 사람은 가능한 즉시 pull·merge 한다.
3. API가 READY가 아닌 문서 버전에 질문을 허용하지 않는지, SSE의 `retrieval`·`citation`·`done` 이벤트를 FE/BE가 함께 확인한다.
4. Supabase migration 적용 순서와 환경변수 변경은 릴리스 체크리스트에 기록한다.
5. 긴 브랜치가 생기면 더 작은 PR로 쪼개거나 담당자와 페어로 병합한다.

## 10. 매일 확인할 체크리스트

작업 시작 전:

- [ ] `main`을 fast-forward로 최신화했다.
- [ ] 최신 main에서 내 브랜치를 만들었다.
- [ ] 내가 수정할 폴더의 오너와 공통 파일 변경 여부를 공유했다.

PR 전:

- [ ] `.env*`, 키, 원본 문서, 개인 데이터가 stage 되지 않았다.
- [ ] `git diff --check`와 해당 테스트를 통과했다.
- [ ] RLS/Storage/API/임베딩 변경 영향과 롤백 방법을 PR에 적었다.
- [ ] UI면 화면 증거, 서버면 호출·테스트 방법을 넣었다.

머지 후:

- [ ] `main`을 최신화했다.
- [ ] 내 브랜치에 `main`을 병합했다.
- [ ] 삭제된 원격 브랜치와 로컬 브랜치를 정리했다.
