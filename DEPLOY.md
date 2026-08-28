# Cloudflare Workers 배포 (OpenNext)

[opennext.js.org/cloudflare](https://opennext.js.org/cloudflare) 어댑터로 Cloudflare **Workers**에 배포한다.
세팅은 완료되어 있다: [wrangler.jsonc](wrangler.jsonc) · [open-next.config.ts](open-next.config.ts) ·
`next.config.ts`의 `initOpenNextCloudflareForDev()` · package.json `preview`/`deploy` 스크립트.

> **Pages + `@cloudflare/next-on-pages`(Edge Runtime) 방식이 아니다.**
> 그 조합은 라우트마다 `export const runtime = 'edge'`를 요구하는데, 이 앱은 Prisma driver
> adapter, `import crypto from 'crypto'`, 25MB 서버 액션 업로드를 쓴다 — Edge Runtime으로
> 옮기면 대부분 깨진다. **`export const runtime = 'edge'`를 추가하지 말 것.**
> Workers + `nodejs_compat`가 지금 이 앱에 맞는 조합이다.

> **Windows에서는 `opennextjs-cloudflare build`가 크래시한다 (OpenNext 공식 Windows 비호환).**
> 배포 빌드는 **WSL(Ubuntu) 또는 CI(리눅스 러너)** 에서 실행할 것.
> [.github/workflows/deploy.yml](.github/workflows/deploy.yml)이 이 경로를 자동화한다.

---

## ⚠ 가장 흔한 배포 사고: `NEXT_PUBLIC_*`를 시크릿으로 넣는 것

환경변수는 **성격이 두 가지**이고, 넣는 위치가 다르다.

| 종류 | 예시 | 넣는 곳 | 이유 |
|---|---|---|---|
| **빌드 변수** | `NEXT_PUBLIC_*` 전부 | **빌드 환경변수** (CI `env:` / WSL 셸 export) | Next가 빌드 시점에 **클라이언트 번들에 문자열로 인라인**한다. 런타임에는 읽을 대상 자체가 없다. |
| **런타임 시크릿** | `DATABASE_URL`, `*_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` … | `wrangler secret put` | 서버에서만 읽는다. 번들에 들어가면 안 된다. |

`NEXT_PUBLIC_SUPABASE_URL`을 `wrangler secret put`으로만 등록하면 **배포는 성공하는데
브라우저에서 Supabase 클라이언트가 `undefined`로 죽는다.** 로그인/세션이 통째로 안 되면
여기부터 의심할 것. 배포 후 `/api/health`의 `supabase_auth` 항목이 이걸 잡아 준다.

---

## 1회 준비

```bash
npx wrangler login          # Cloudflare 계정 연결
```

### 런타임 시크릿 등록

```bash
# 필수
npx wrangler secret put DATABASE_URL              # Supabase pooler(6543) URL
npx wrangler secret put DIRECT_URL                # 직결(5432) — 마이그레이션용
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put AI_SECRET_KEY             # 개인정보/API키 암호화(AES-256)
npx wrangler secret put AI_SECRET_KEY_2           # 이중 암호화 2차 키 (권장)

# 소셜 로그인 (쓰는 경우)
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET

# 메일 발송(SMTP) — 없으면 dry-run으로 기록만 남는다
npx wrangler secret put SMTP_HOST          # smtp.gmail.com
npx wrangler secret put SMTP_PORT          # 465
npx wrangler secret put SMTP_USER          # hicecorp.team@gmail.com
npx wrangler secret put SMTP_PASS          # Gmail 앱 비밀번호 16자리 (계정 비밀번호 아님)
npx wrangler secret put EMAIL_FROM         # debateCode <hicecorp.team@gmail.com>

# AI — Free AI · debateQ · AI Search · 번역이 전부 이 키 하나를 쓴다.
# 상용 API 키는 넣지 않는다(이용자가 설정에서 자기 키를 등록해 쓴다).
npx wrangler secret put HUGGINGFACE_API_KEY
```

### 빌드 변수 등록 (GitHub Secrets)

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_SITE_URL` ·
`NEXT_PUBLIC_CHANNEL_PLUGIN_KEY` · `NEXT_PUBLIC_GOOGLE_API_KEY` ·
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` · `NEXT_PUBLIC_GOOGLE_APP_ID` ·
`NEXT_PUBLIC_WEBAUTHN_RPID` · `NEXT_PUBLIC_WEBAUTHN_ORIGIN`
+ `DATABASE_URL` / `DIRECT_URL`(prisma generate용) + `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`

전체 키 목록과 설명은 [.dev.vars.example](.dev.vars.example)에 있다.

### 로컬 미리보기용

`.dev.vars.example`를 `.dev.vars`로 복사해 값을 채운다(gitignore됨).
`next dev`는 `.env`를, `npm run preview`(workerd)는 `.dev.vars`를 읽는다 — **두 파일이
어긋나면 "dev에서는 되는데 preview에서 안 되는" 상황이 된다.**

---

## 배포

### CI (권장)

`main`에 push하면 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)이
`npm ci → prisma generate → tsc --noEmit → lint → opennextjs-cloudflare build → deploy →
헬스체크`를 리눅스 러너에서 실행한다. `workflow_dispatch`의 `dry_run`으로 빌드만 돌려볼 수 있다.

### 수동 (WSL 또는 리눅스)

```bash
npm run preview     # 로컬 workerd에서 프로덕션 빌드 미리보기
npm run deploy      # 빌드 + Cloudflare Workers 배포
```

`predeploy`(= `prisma generate` + `tsc --noEmit` + `eslint`)는 npm 라이프사이클에 따라
`npm run deploy` 앞에서 **자동으로** 실행된다. 따로 돌려보고 싶으면 `npm run predeploy`.

---

## 데이터베이스

Prisma는 Workers용으로 `engineType = "client"`(Rust-free) + `@prisma/adapter-pg`로 설정돼 있다.
`DATABASE_URL`은 반드시 **Supabase pooler(6543, pgbouncer)** URL을 쓴다 — 직결(5432)로는
Workers 동시성에서 커넥션이 말라 죽는다.

스키마 변경은 배포와 별개로 적용한다:

```bash
npx prisma db execute --file prisma/manual-additive.sql --schema prisma/schema.prisma
npx prisma generate
```

### ⚠ 이번 배포에 반드시 먼저 적용할 마이그레이션

마이그레이션이 **두 개**다. 번호 순서대로 적용한다.

1. `prisma/migrations/20260825120000_judge_pipeline_ai_limits_security/migration.sql`
2. `prisma/migrations/20260825140000_login_two_factor/migration.sql`

```bash
npx prisma db execute   --file prisma/migrations/20260825120000_judge_pipeline_ai_limits_security/migration.sql   --schema prisma/schema.prisma

npx prisma db execute   --file prisma/migrations/20260825140000_login_two_factor/migration.sql   --schema prisma/schema.prisma

npx prisma generate
npx tsx --env-file=.env scripts/check-schema-drift.ts
```

**코드보다 먼저 적용해야 한다.** 새 코드는 여기서 만드는 표(`JudgeSession`,
`AiUsageCounter`)와 함수(`ai_usage_hit` 등)에 의존하므로, 순서가 뒤바뀌면 채점과 AI 호출이
전부 실패한다. 인덱스와 표 생성은 전부 `IF NOT EXISTS`라 여러 번 돌려도 안전하다.

되돌릴 수 없는 두 가지가 들어 있으니 미리 알고 있어야 한다:

- **기존 백업 코드가 전부 삭제된다.** 암호문으로 저장하던 것을 sha256으로 바꾸는데,
  평문을 복원할 수 없으므로(그리고 복원해서도 안 되므로) 버린다. 이용자는 설정에서
  다시 발급받으면 된다 — 재발급은 원래도 언제든 가능한 동작이다.
- **형식을 옮길 수 없는 보안키 행이 삭제된다.** 등록만 되고 인증에 쓰인 적이 없는 값들이다
  (인증 경로 자체가 없었다). 이용자는 설정에서 다시 등록한다.

적용 전에 백업을 받아 두는 편이 좋다. 두 항목 모두 이용자가 스스로 복구할 수 있으므로
서비스가 멈추지는 않는다.

---

## 배포 후 확인

1. `GET /api/health` — DB 왕복시간, Supabase 인증, 암호화 키, AI 업스트림, 메일, WebAuthn.
   콘솔 권한으로 로그인하면 항목별 상세가, 익명에게는 `{ok:true}`만 나온다.
2. **콘솔 › 시스템 › 상태** (`/console/system`) — 같은 내용을 화면으로.
3. 로그: `npx wrangler tail` 또는 Cloudflare 대시보드 (observability가 켜져 있다).

## 출시 전 반드시 확인 — 메일 발송

메일이 나가는 길은 **두 갈래**이고, 둘 다 같은 Gmail 계정(`hicecorp.team@gmail.com`)을 쓰지만
설정하는 곳이 다르다. 하나만 해 두면 나머지 절반이 조용히 안 나간다.

| 무엇이 | 어디서 보내나 | 설정하는 곳 |
|---|---|---|
| 가입 인증 코드, 비밀번호 재설정 | Supabase Auth | Supabase 대시보드 → Authentication → Emails → **SMTP Settings** |
| 문의 답변, 복구 이메일 코드, 홍보 메일 | 앱 ([app/lib/smtp.ts](app/lib/smtp.ts)) | Wrangler 시크릿 `SMTP_*` |

### 1) Gmail 앱 비밀번호 발급 (양쪽이 같이 쓴다)

1. `hicecorp.team@gmail.com`으로 로그인 → 구글 계정 → 보안 → **2단계 인증을 먼저 켠다**
   (2단계 인증이 꺼져 있으면 앱 비밀번호 메뉴 자체가 나오지 않는다).
2. <https://myaccount.google.com/apppasswords> 에서 앱 이름을 `debateCode`로 만들고
   **16자리**를 받는다. 공백은 빼고 붙여넣는다.
3. 이 값은 한 번만 보여 준다. 못 옮겨 적었으면 지우고 새로 만든다.

### 2) Supabase Auth 쪽 (가입 인증 코드)

Authentication → Emails → SMTP Settings:

```
Host      smtp.gmail.com
Port      465
Username  hicecorp.team@gmail.com
Password  (위 앱 비밀번호)
Sender    hicecorp.team@gmail.com / debateCode
```

**커스텀 SMTP를 켜지 않으면 Supabase 기본 메일은 시간당 몇 통 수준으로 막힌다.** 사람이 몇 명만
몰려도 "코드가 오지 않아 가입이 안 되는" 상태가 되는데, 코드 문제가 아니라 설정 문제라
로그에도 드러나지 않는다. 켠 뒤 **Authentication → Rate Limits**의 시간당 한도도 함께 올린다.

### 3) 앱 쪽 (문의 답변·홍보 메일)

위 "런타임 시크릿 등록"의 `SMTP_*` 다섯 개를 넣는다. 발신 주소(`EMAIL_FROM`)의 주소 부분은
`SMTP_USER`와 **같아야 한다** — 다르면 Gmail이 조용히 바꾸거나 아예 거절한다.

### 4) 배포 후 실제로 도착하는지 확인

**콘솔 › 시스템 › 상태**의 "메일 도달 확인"에서 테스트 메일을 보낸다. 헬스체크는 키가 꽂혀
있으면 초록불을 주지만, 앱 비밀번호 만료·발신 주소 불일치·스팸 분류는 그 초록불 아래에서
벌어진다. **스팸함까지** 확인할 것.

### 알아 둘 한도

- 무료 Gmail 계정은 **하루 약 500통**(Google Workspace는 2,000통)이 상한이다.
  홍보 메일 대상이 그보다 많으면 며칠로 나눠 보내거나 Workspace로 올려야 한다.
- 발신이 `@gmail.com`인 동안에는 SPF·DKIM을 우리가 손댈 수 없다(구글 도메인이라 이미 서명된다).
  자체 도메인(`@debatecode.org`)으로 옮기는 시점에 SPF·DKIM·DMARC를 설정해야 하고,
  그때는 `RESEND_API_KEY` 경로로 갈아타는 편이 낫다 — 코드는 이미 양쪽을 다 지원한다.

## 알려진 한계

- **레이트 리밋이 isolate 로컬이다.** [app/lib/rate-limit.ts](app/lib/rate-limit.ts)는 인메모리
  슬라이딩 윈도우라, Workers가 isolate를 여러 개 띄우면 전역 카운팅이 되지 않는다. 실효 한도가
  설정값보다 느슨해진다. 대응이 필요하면 **콘솔 › 시스템 › 런타임 설정**에서 한도를 즉시 조일 수
  있다(재배포 불필요). 근본 해결은 KV/D1 백엔드 리미터로 교체하는 것이다.
- **`.open-next/` 빌드 산출물은 커밋하지 않는다** (gitignore됨). CI가 매번 새로 만든다.

## 장애 시 첫 대응 (재배포 없이)

**콘솔 › 시스템**에서 코드 수정 없이 처리할 수 있다:

- 특정 기능만 오류 → **런타임 설정**에서 해당 기능 플래그 off
- 스팸/어뷰징 폭주 → 가입·글쓰기 플래그 off, 레이트 한도 축소
- AI 공급자 장애 → 기본 공급자/모델을 다른 곳으로 전환
- 전면 장애 → **유지보수 모드** on (운영진은 그대로 접속 가능)

---

## 보안 — 무엇을 코드가 막고, 무엇을 엣지가 막는가

이 구분이 중요하다. **애플리케이션 코드는 DDoS를 막을 수 없다.** 요청이 Worker에
닿은 시점에 이미 실행 비용이 발생했기 때문이다. 대량 트래픽은 도달하기 전에 끊어야 한다.

### 코드가 맡는 것 (구현됨)

| 위협 | 방어 | 위치 |
|---|---|---|
| SQL 인젝션 | Prisma 파라미터 바인딩. 원시 쿼리는 태그드 템플릿만 사용하고 `$queryRawUnsafe`는 쓰지 않는다 | 전역 |
| 무차별 대입(로그인·가입·재설정) | DB 기반 지속 카운터. 인스턴스가 바뀌어도 횟수가 남고, 증가·판정이 한 SQL 문에서 원자적으로 처리된다 | `app/lib/rate-limit-durable.ts` |
| 비용 남용(AI 호출) | 로그인 필수 + **회수 기반 사용 한도**(AI Search 하루 15회 · debateAI 문제당 10회 · 면접관 무제한). 증가·판정이 한 SQL 문에서 원자적으로 처리된다. 개인 API 키·로컬 모델은 이용자 부담이라 세지 않는다 | `app/lib/ai/usage-limits.ts`, `app/lib/ai/funding.ts` |
| 비용 남용(업로드·번역) | 인메모리 슬라이딩 윈도우 + 지속 카운터. `/api/translate`의 LLM 경로는 로그인 필수(사전 조회만 공개) | `app/lib/rate-limit.ts`, `app/api/translate/route.ts` |
| 채점 결과 위조 | 판정을 서버가 한다. 브라우저는 실행 결과만 보고하고, 기대 출력은 내려가지 않는다. 세션은 1회용이고 코드 지문으로 묶인다 | `app/lib/judge/server.ts` |
| 포인트 이중 사용 | 잔액 확인과 차감이 한 트랜잭션(Serializable). 재고는 `UPDATE … WHERE stock > 0`의 영향 행 수로 판정 | `app/lib/actions/mate.ts` |
| SSRF(URL·GitHub 가져오기) | 사설망·루프백·메타데이터 IP 차단, 리다이렉트 홉마다 재검사 | `app/api/ai-search/import/route.ts` |
| XSS | React 기본 이스케이프. `dangerouslySetInnerHTML` 0건. CSP `object-src 'none'`, `base-uri 'self'` | `next.config.ts` |
| 클릭재킹 | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` | `next.config.ts` |
| 이용자 API 키 유출 | AES-256-GCM 이중 암호화. **키가 없으면 운영에서는 저장을 거부한다**(평문으로 떨어지지 않는다) | `app/lib/crypto.ts` |
| 개인 첨부 유출 | 비공개 버킷 + 소유자 확인 후 5분 서명 URL. 버킷 RLS가 2차 방어 | `app/api/ai-search/file/route.ts` |
| 권한 우회 | 역할 + 계정별 오버라이드(deny 우선), 서버에서만 판정 | `app/lib/permissions-server.ts` |
| 비밀번호만으로의 계정 접근 | 2차 인증을 켠 계정은 세션이 확인을 통과해야 화면·API가 열린다. 수단은 인증 앱·복구 이메일·복구 키·보안키 넷 | `app/lib/dal.ts`, `app/lib/two-factor.ts` |
| 자격 증명이 주소에 남는 것 | 클라이언트 폼에 `method="post"` — 하이드레이션 전 제출도 본문으로 나간다 | `app/(auth)/login/login-form.tsx` |

### 엣지가 맡아야 하는 것 (Cloudflare 대시보드에서 설정 — 코드로 불가)

1. **Rate Limiting Rules** — `/api/*`와 `/login`에 IP 단위 상한.
   권장 시작값: `/api/ai-search/*` 분당 30, `/login` 분당 20, 그 외 `/api/*` 분당 120.
2. **WAF Managed Rules** — OWASP 코어 룰셋을 켠다.
3. **Bot Fight Mode** — 자동화 트래픽 차단.
4. **DDoS Protection** — 기본 활성이지만 임계값을 서비스 규모에 맞춘다.
5. **Under Attack Mode** — 공격이 실제로 오면 수동으로 올린다.

> 위 다섯을 켜지 않으면, 아래 코드 방어가 아무리 촘촘해도 요금과 가용성은 지켜지지 않는다.

### 비밀값 취급 규칙

- `AI_SECRET_KEY`(+ 권장 `AI_SECRET_KEY_2`)는 **운영에 반드시 설정**한다. 없으면 이용자
  API 키 저장이 실패한다 — 의도된 동작이다(평문 저장보다 낫다).
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- 소스 코드가 공개되어도 안전해야 한다. 비밀은 코드가 아니라 환경 변수와 DB 암호화에 있다.

### 정기 점검

```bash
npx tsx --env-file=.env scripts/check-rate-limit.ts   # 지속 리미터 동작 확인
node scripts/qa-walkthrough.mjs                        # 브라우저 UX·반응형 회귀 검사
```

**콘솔 › 시스템 › 상태**의 `만료 데이터 정리`를 주기적으로(주 1회 정도) 누른다.
레이트리밋 카운터·AI 사용량·채점 세션·이메일 인증 코드·가입 초안이 정리된다.
cron으로 돌리지 않는 이유는 아래 "알려진 한계"에 적힌 그대로다 — OpenNext가 만드는
worker.js에는 `scheduled` 핸들러가 없다. 정기 실행이 필요해지면 Supabase의 `pg_cron`으로
DB 안에서 도는 편이 맞다(정리 함수는 전부 SQL 함수로 만들어져 있다).
