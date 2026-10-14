# Vercel 배포 (Next.js / Node.js)

이 프로젝트는 Next.js App Router와 Prisma 기본 Node.js Client를 사용하며, Vercel의 Next.js 프레임워크 감지 및 Node.js 런타임으로 배포한다.

## 프로젝트 설정

Vercel에서 Git 저장소를 가져온 뒤 다음 설정을 확인한다.

- Framework Preset: `Next.js`
- Root Directory: 저장소 루트
- Install Command: `npm ci` (자동 감지값 사용 가능)
- Build Command: `npm run build`
- Output Directory: 자동 감지값 유지
- Node.js Version: 22

`npm run build`는 `prisma generate` 후 `next build`를 실행한다. Git에 연결하면 Production 브랜치 push는 Production 배포로, 나머지 브랜치 push는 Preview 배포로 생성된다.

## 환경변수

[.env.example](.env.example)을 기준으로 Vercel Project Settings → Environment Variables에 등록한다. Preview와 Production 값은 환경별로 구분한다.

필수값:

- `DATABASE_URL`: Supabase Postgres pooler URL (6543)
- `DIRECT_URL`: Supabase 직결 URL (5432, 마이그레이션용)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`: 배포 환경의 실제 URL
- `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용
- `AI_SECRET_KEY`: 기존 데이터 복호화에 쓰므로 운영 중 값을 바꾸지 않는다

기능별로 `AI_SECRET_KEY_2`, `HUGGINGFACE_API_KEY`, `RESEND_API_KEY`, OAuth, Google Picker, Channel Talk, WebAuthn 변수를 추가한다. `NEXT_PUBLIC_*` 값은 빌드 때 클라이언트 번들에 들어가므로 Preview와 Production 모두 올바른 값을 지정한다. 서버 비밀에는 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

메일을 실제 발송하려면 Vercel에서 `RESEND_API_KEY`와 Resend에서 인증한 발신 주소를 설정하는 방식을 권장한다. 서버리스의 직접 SMTP 연결은 호스트의 TCP 정책에 따라 달라질 수 있다. 메일 변수가 없으면 화면은 dry-run으로 동작하며 실제 메일을 보내지 않는다.

Vercel 도메인을 Supabase Auth의 Site URL/Redirect URLs 및 소셜 OAuth 콜백 허용 목록에 추가한다. WebAuthn을 사용하면 `NEXT_PUBLIC_WEBAUTHN_RPID`와 `NEXT_PUBLIC_WEBAUTHN_ORIGIN`도 배포 도메인에 맞춘다.

## 데이터베이스

배포 전에 스키마 변경을 검토하고 필요한 additive SQL을 먼저 적용한다. 현재 운영 반영이 필요한 마이그레이션은 아래 순서로 실행한다.

```bash
npx prisma db execute --file prisma/migrations/20260825120000_judge_pipeline_ai_limits_security/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260825140000_login_two_factor/migration.sql --schema prisma/schema.prisma
npx prisma generate
npx tsx --env-file=.env.local scripts/check-schema-drift.ts
```

첫 마이그레이션은 기존 백업 코드 및 일부 보안키 행을 삭제한다. 실행 전에 DB 백업과 영향 행 수를 확인하고, 필요한 이용자 공지를 마친다. 스키마를 바꾸지 않는 배포에는 다시 실행할 필요가 없다.

## 검증과 운영

```bash
npm ci
npm run predeploy
npm run build
npm run start
```

배포 후 `/api/health`와 `/console/system`에서 DB·인증·암호화·메일 상태를 확인한다. Vercel 프로젝트의 Deployments → Functions 로그에서 서버 오류를 확인한다. Rate limit 및 WAF/Firewall 규칙은 Vercel 프로젝트의 보안 설정과 앱의 DB 기반 제한을 함께 사용한다.

Vercel Functions는 요청과 응답 본문을 각각 최대 **4.5 MB**로 제한한다. Server Actions는 플랫폼 제한보다 낮은 4 MB로 설정했다. 큰 첨부는 `/api/attachments/upload/signed`에서 발급한 서명 정보로 브라우저가 Supabase Storage에 직접 올리는 흐름을 사용한다. 본문을 앱 서버로 보내는 일반 업로드는 Vercel에서 4.5 MB를 넘기면 실패한다.
