# 배포 전 점검 목록

전체 배포 절차는 [DEPLOY.md](../DEPLOY.md)에 있다. 이 문서는 **배포 직전에 눈으로 훑는 체크리스트**다.

## 1. 환경변수 — 성격에 맞는 자리에 있는가

가장 흔한 사고가 여기서 난다. [.dev.vars.example](../.dev.vars.example)의 전체 목록과 대조한다.

- [ ] `NEXT_PUBLIC_*` 이 **빌드 환경변수**로 들어가 있다 (GitHub Secrets → 워크플로 `env:`).
      `wrangler secret put`으로 넣었다면 **잘못된 것** — 클라이언트 번들에 들어가지 않는다.
- [ ] `DATABASE_URL`이 Supabase **pooler(6543)** URL이다. 직결(5432)이면 Workers 동시성에서 커넥션이 마른다.
- [ ] `AI_SECRET_KEY`가 개발용과 다른 프로덕션 값이다. **이 키가 바뀌면 기존 암호화 데이터를 못 읽는다.**
- [ ] `SUPABASE_SERVICE_ROLE_KEY`가 런타임 시크릿으로만 있다 (`NEXT_PUBLIC_` 접두어가 붙어 있지 않다).
- [ ] `NEXT_PUBLIC_WEBAUTHN_RPID` / `_ORIGIN`이 실제 배포 도메인과 일치한다 (불일치 시 보안키 등록 실패).
- [ ] `NEXT_PUBLIC_SITE_URL`이 실제 도메인이다 (메일 링크·OAuth 리다이렉트가 이 값을 쓴다).

## 2. 정적 검사

```bash
npm ci
npm run predeploy      # prisma generate + tsc --noEmit + eslint
```

- [ ] 타입 오류 0
- [ ] 린트 오류 0

## 3. 데이터베이스

- [ ] `prisma/schema.prisma`와 실제 DB 스키마가 일치한다.
- [ ] 추가 SQL을 적용했다:

```bash
npx prisma db execute --file prisma/manual-additive.sql --schema prisma/schema.prisma
npx prisma generate
```

- [ ] 마이그레이션이 **additive**다 (컬럼 삭제·타입 변경은 구버전 워커가 살아 있는 동안 500을 낸다).

## 4. 빌드 확인 (리눅스 / WSL)

```bash
npm run preview        # workerd에서 프로덕션 빌드 실행
```

- [ ] Windows에서 실행하지 않았다 (OpenNext는 Windows 빌드가 크래시한다).
- [ ] preview에서 로그인 → 문제 풀이 → 커뮤니티 글 작성이 된다.

## 5. 스모크 테스트

- [ ] `/login` 로그인 · `/signup` 가입
- [ ] `/settings/security` 2FA 등록/해제
- [ ] `/community` 목록 · 글 작성 · 댓글/답글 · 첨부 업로드
- [ ] `/problems/[id]` 코드 실행 · 제출 · 면접 진입
- [ ] `/console` 접속 (관리자) — 사이드바 배지 카운트가 뜬다
- [ ] `/console/system` — 헬스 항목이 전부 `ok`이거나, `unconfigured`인 이유가 납득된다

## 6. 배포

```bash
npm run deploy         # 또는 main에 push → GitHub Actions
```

## 7. 배포 직후

- [ ] `curl https://<도메인>/api/health` → `{"ok":true}`
- [ ] `/console/system`에서 DB 왕복시간이 정상 범위(수백 ms 이내)
- [ ] `npx wrangler tail`로 첫 몇 분간 5xx가 없는지 확인
- [ ] 브라우저 콘솔에 Supabase 관련 `undefined` 오류가 없는지 (있으면 1번 항목 재확인)

## 문제가 생기면

**재배포 없이** 대응할 수 있는 경로가 있다 — 콘솔 › 시스템:

| 증상 | 대응 |
|---|---|
| 특정 기능만 오류 | 런타임 설정에서 해당 기능 플래그 off |
| 스팸·어뷰징 폭주 | 가입/글쓰기 플래그 off, 레이트 한도 축소 |
| AI 공급자 장애 | 기본 공급자·모델 전환 |
| 전면 장애 | 유지보수 모드 on (운영진은 계속 접속 가능) |

코드 원인은 대개 서버 액션 변경이나 Prisma 스키마 불일치다. Workers 로그와
`prisma migrate status`를 먼저 본다.
