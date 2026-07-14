# Supabase 연결 및 Vercel 배포 가이드

## 1. 필요한 결정과 계정

- Supabase 프로젝트 region과 Auth 로그인 방식
- Vercel Hobby/Pro 여부와 ingestion 워커 실행 위치
- OpenAI 프로젝트 API key 및 답변 모델의 비용/품질 정책
- 배포 URL과 Supabase Auth redirect URL

현재 코드 기본값은 200MB, `text-embedding-3-small` 1536차원, 효율형 `gpt-5.6-luna`, 동시 작업 1개입니다.

## 2. Supabase

1. Supabase 프로젝트를 만들고 **Connect** 화면에서 Project URL, Publishable key, Secret/service role key를 확인합니다.
2. 로컬 CLI를 로그인·연결합니다.

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push
```

3. SQL Editor에서 아래를 확인합니다.

```sql
select extname from pg_extension where extname in ('vector', 'pgcrypto', 'pg_trgm');
select id, public, file_size_limit from storage.buckets where id = 'knowledge-files';
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```

4. Auth의 Site URL/Redirect URL에는 로컬 주소와 실제 Vercel 도메인만 등록합니다. 로그인 방식은 프론트 통합 전에 확정합니다.

마이그레이션은 원격 Dashboard에서 임의 수정하지 않습니다. 이미 적용한 SQL은 고치지 않고 새 migration을 추가합니다.
현재 UI/관리자 기능과 문서 버전 교체까지 사용하려면 `202607130001`부터 `202607130004_document_lifecycle.sql`까지 모두 적용되어야 합니다.

## 3. 환경변수

`.env.example`의 변수 이름을 Development, Preview, Production에 설정합니다.

| 변수 | 공개 여부 | 용도 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 가능 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 가능 | 브라우저/SSR publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 비밀 | DB/Storage trusted backend |
| `OPENAI_API_KEY` | 서버 비밀 | 임베딩·답변 |
| `OPENAI_RESPONSE_MODEL` | 서버 설정 | 기본 `gpt-5.6-luna` |
| `CRON_SECRET` | 서버 비밀 | 워커 엔드포인트 인증, 32자 이상 |
| `RAG_MAX_FILE_BYTES` | 서버 설정 | 기본 209715200 (200MB) |
| `RAG_WORKER_ID` | 서버 설정 | 로그/lock 식별자 |
| `RAG_WORKER_BATCH_SIZE` | 서버 설정 | 호출당 1~5개 |

Vercel CLI 예시는 다음과 같습니다. 값은 명령행 인수나 Git에 기록하지 말고 프롬프트에 입력합니다.

```powershell
npx.cmd vercel link
npx.cmd vercel env add NEXT_PUBLIC_SUPABASE_URL
npx.cmd vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx.cmd vercel env add SUPABASE_SERVICE_ROLE_KEY
npx.cmd vercel env add OPENAI_API_KEY
npx.cmd vercel env add OPENAI_RESPONSE_MODEL
npx.cmd vercel env add CRON_SECRET
```

환경변수 변경은 기존 배포에 소급되지 않으므로 재배포합니다.

## 4. ingestion 실행 방식

Vercel 함수는 `vercel.json`에서 최대 실행 시간을 300초로 설정했습니다. 프로젝트 요금제의 실제 한도가 더 짧으면 그 한도가 우선합니다.

### 선택 A: Vercel Cron을 쓸 수 있는 요금제

`vercel.json`에 아래를 추가하고 프로젝트의 `CRON_SECRET`을 설정합니다. 실제 주기는 처리량과 요금제 제한에 맞춥니다.

```json
{
  "crons": [
    { "path": "/api/internal/ingestion/run", "schedule": "*/5 * * * *" }
  ]
}
```

### 선택 B: 별도 장기 실행 워커

Vercel은 API/프론트만 배포하고 Render, Railway, VM, 로컬 서버 등에서 같은 환경변수로 `npm run worker`를 계속 실행합니다. Hobby에서 짧은 주기 Cron이 허용되지 않거나 300초를 넘는 문서가 있다면 이 방식이 안전합니다.

두 방식을 동시에 써도 DB의 `FOR UPDATE SKIP LOCKED` 선점 때문에 같은 작업을 중복 처리하지 않습니다.

## 5. 배포와 smoke test

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npx.cmd vercel
npx.cmd vercel --prod
```

배포 후 순서대로 확인합니다.

1. 미인증 `/api/health`가 `up`인지 확인하고, 설정 상세가 필요하면 `Authorization: Bearer <CRON_SECRET>`로 호출
2. 로그인 사용자로 workspace 생성
3. `/admin/documents/new`에서 작은 DOCX/PDF를 signed URL로 업로드
4. 워커 호출 후 상태가 `READY`인지 확인
5. `/chat`에서 `retrieval → citation/token → done`과 출처 원문 열기 확인
6. `/admin/documents/{id}`에서 청크·페이지·헤딩 경로를 검수하고, 새 버전 업로드 후 이전 버전이 검색 대상에서 제외되는지 확인
7. `/admin`, `/admin/history`, `/admin/analytics`의 집계와 메모 저장 확인
8. 다른 workspace 사용자가 문서·인용 원문에 접근하지 못하는지 확인

## 6. 롤백

- 애플리케이션은 Vercel의 직전 정상 배포로 롤백합니다.
- migration은 파일 삭제/수정으로 되돌리지 않습니다. 필요한 역변경을 새 migration으로 작성합니다.
- 임베딩 모델/차원을 바꿀 때는 새 프로필과 재색인 계획을 만들며 현재 1536 벡터와 섞지 않습니다.
