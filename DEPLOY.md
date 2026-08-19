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
