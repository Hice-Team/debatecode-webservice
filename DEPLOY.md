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

# 메일 발송 — 없으면 dry-run으로 기록만 남는다
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM

# Debate Free AI 업스트림 — 있는 키의 모델만 카탈로그에 노출된다
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GOOGLE_AI_API_KEY
npx wrangler secret put GROK_API_KEY
npx wrangler secret put HUGGINGFACE_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put PERPLEXITY_API_KEY

# debateQ 빌트인 모델 — 미설정 시 규칙 기반 폴백
npx wrangler secret put AI_BUILTIN_PROVIDER
npx wrangler secret put AI_BUILTIN_MODEL
npx wrangler secret put AI_BUILTIN_API_KEY
```

### 빌드 변수 등록 (GitHub Secrets)

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_SITE_URL` ·
`NEXT_PUBLIC_CHANNEL_PLUGIN_KEY` · `NEXT_PUBLIC_GOOGLE_API_KEY` ·
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` · `NEXT_PUBLIC_WEBAUTHN_RPID` · `NEXT_PUBLIC_WEBAUTHN_ORIGIN`
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

---

## 배포 후 확인

1. `GET /api/health` — DB 왕복시간, Supabase 인증, 암호화 키, AI 업스트림, 메일, WebAuthn.
   콘솔 권한으로 로그인하면 항목별 상세가, 익명에게는 `{ok:true}`만 나온다.
2. **콘솔 › 시스템 › 상태** (`/console/system`) — 같은 내용을 화면으로.
3. 로그: `npx wrangler tail` 또는 Cloudflare 대시보드 (observability가 켜져 있다).

## 출시 전 반드시 확인 — 메일 발송

가입 흐름이 **이메일 인증 코드**에 의존한다(`/signup` 2단계). 이 코드는 Supabase Auth가 보낸다.

**Supabase 기본 메일 서비스는 시간당 몇 통 수준으로 제한된다.** 커스텀 SMTP를 설정하지 않으면
사람이 몇 명만 몰려도 "코드가 오지 않아 가입이 안 되는" 상태가 된다. 코드 문제가 아니라
설정 문제라 로그에도 잘 드러나지 않는다.

1. Supabase 대시보드 → **Authentication → Emails → SMTP Settings**에서 커스텀 SMTP를 켠다.
   Resend를 쓴다면: host `smtp.resend.com`, port `465`, user `resend`, password는 Resend API 키.
2. **Authentication → Rate Limits**에서 시간당 발송 한도를 실제 예상 가입량에 맞게 올린다.
3. 보내는 주소의 도메인에 SPF·DKIM을 설정한다. 없으면 스팸함으로 간다.

앱이 직접 보내는 메일(문의 답변, 복구 이메일 코드, 홍보 메일)은 Supabase가 아니라
`RESEND_API_KEY`를 쓴다 — **둘 다 설정해야 한다.** 키가 없으면 dry-run으로 기록만 남고
실제로는 나가지 않는다(콘솔 화면에 그렇게 표시된다).

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
