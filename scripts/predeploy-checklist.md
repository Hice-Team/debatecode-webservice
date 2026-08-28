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

### ⚠ 이번 배포는 마이그레이션을 **코드보다 먼저** 적용해야 한다

새 코드는 여기서 만드는 표(`JudgeSession`, `AiUsageCounter`)와 SQL 함수(`ai_usage_hit` 등)에
의존한다. 순서가 뒤바뀌면 **채점과 AI 호출이 전부 500**이 난다(실제로 확인함).

마이그레이션이 **두 개**다. 번호 순서대로 적용한다.

```bash
npx prisma db execute   --file prisma/migrations/20260825120000_judge_pipeline_ai_limits_security/migration.sql   --schema prisma/schema.prisma

npx prisma db execute   --file prisma/migrations/20260825140000_login_two_factor/migration.sql   --schema prisma/schema.prisma

npx prisma generate
npx tsx --env-file=.env scripts/check-schema-drift.ts   # "드리프트 없음"이 나와야 한다
```

- [ ] 마이그레이션 **두 개를 순서대로** 적용했다
- [ ] `npx prisma generate`를 다시 돌렸다
- [ ] `check-schema-drift.ts`가 "드리프트 없음"을 냈다
- [ ] 적용 전에 백업을 받았다 (`node scripts/db-backup.mjs`)

이 마이그레이션이 지우는 것 — **적용 전에 행 수를 먼저 확인한다**:

```sql
SELECT (SELECT COUNT(*) FROM "BackupCode")  AS backup_codes,
       (SELECT COUNT(*) FROM "WebauthnKey") AS security_keys;
```

- [ ] `BackupCode` 행 수를 확인했다 — **전부 삭제된다**(암호문 → sha256 전환, 평문 복원 불가).
      이용자는 설정에서 재발급하면 된다.
- [ ] `WebauthnKey` 행 수를 확인했다 — credential 형식을 옮길 수 없는 행이 삭제된다.
      이용자는 설정에서 다시 등록한다. 등록된 이용자가 있으면 **미리 공지한다.**

> 둘 다 0행이면 이 항목은 무해하다. 0이 아니면 해당 이용자에게 알린 뒤 적용한다.

### 그 밖에

- [ ] `prisma/schema.prisma`와 실제 DB 스키마가 일치한다 (`npx tsx --env-file=.env scripts/check-schema-drift.ts`).
- [ ] 예전 추가 SQL도 적용돼 있다:

```bash
npx prisma db execute --file prisma/manual-additive.sql --schema prisma/schema.prisma
```

- [ ] 마이그레이션이 **additive**다 (컬럼 삭제·타입 변경은 구버전 워커가 살아 있는 동안 500을 낸다).
      이번 마이그레이션의 컬럼 삭제(`BackupCode.code`, `WebauthnKey.credential`)는 새 코드가
      더 이상 읽지 않는 컬럼이라 **먼저 적용해도 구버전이 죽지 않는다** — 다만 구버전의
      백업 코드 발급 화면은 그 순간부터 실패한다. 배포 간격을 짧게 둔다.

## 4. 빌드 확인 (리눅스 / WSL)

```bash
npm run preview        # workerd에서 프로덕션 빌드 실행
```

- [ ] Windows에서 실행하지 않았다 (OpenNext는 Windows 빌드가 크래시한다).
- [ ] preview에서 로그인 → 문제 풀이 → 커뮤니티 글 작성이 된다.

## 5. 스모크 테스트

### 자동 — 권한 상태별 런타임 QA

```bash
npx tsx --env-file=.env scripts/qa-roles.mjs --base http://localhost:3100
```

비로그인 / 일반 / 관리자 / 디베이트메이트 네 상태로 가상 계정을 만들어 실제 브라우저로
돌리고, 끝나면 계정을 지운다. 채점 위조·세션 재사용·코드 지문 대조·AI 한도까지 함께 본다.

- [ ] 실패 0으로 끝났다
- [ ] 마지막 "계정 삭제"에서 `✗ 남아 있음`이 하나도 없다

### 손으로 — 자동으로 못 보는 것

- [ ] `/signup` 가입 → 마무리 화면에서 **인증 코드 보내기 → 메일 수신 → 6자리 입력 → 인증됨**
      (자동 QA는 실제 메일함을 못 연다)
- [ ] `/settings` › 보안 › 이메일 인증 카드가 같은 흐름으로 동작한다
- [ ] `/settings/security` 인증 앱(TOTP) 등록 → 백업 코드 10개가 화면에 뜬다 → 옮겨 적기
- [ ] **등록 직후 로그아웃 → 다시 로그인** → `/login/verify`가 뜨고 인증 앱 코드로 통과된다
- [ ] `/login/verify`에서 **복구 키**로도 통과된다 (쓴 코드는 재사용 불가)
- [ ] 복구 이메일을 등록·확인해 둔 계정에서 `/login/verify` → **복구 이메일로 코드 받기**가 실제로 도착한다
- [ ] 보안키(WebAuthn) 등록 → 목록에 뜬다 → 마지막 키 삭제 시 **확인을 요구한다**
- [ ] 보안키로 `/login/verify`를 통과할 수 있다 (실물 키·지문이 필요해 자동화가 못 한다)
- [ ] 2차 인증을 켠 계정으로 **탈퇴** 시도 → 코드/보안키 확인을 요구한다
- [ ] `/problems/[id]` 실제 브라우저에서 코드 실행 · 제출 · 면접 진입 (Pyodide 로딩 포함)
- [ ] `/community` 첨부 업로드 — 합계 20MB를 넘기면 **전송 전에** 안내가 뜬다
- [ ] `/console/system` — 헬스 항목이 전부 `ok`이거나, `unconfigured`인 이유가 납득된다

## 5-2. 이번 변경의 회귀 지점

새로 만들었거나 계약이 바뀐 곳이다. 여기부터 본다.

- [ ] **채점** — `/api/submissions`는 **삭제됐다**. 프런트가 그 주소를 부르는 곳이 없어야 한다.
      제출은 `/api/judge/session` → `/api/judge/verify` 두 번의 왕복이다.
- [ ] **히든 케이스** — 문제 페이지 HTML에 기대 출력(`expected`)이 없다.
      브라우저 개발자 도구에서 확인: 히든 케이스의 입력조차 보이면 안 된다.
- [ ] **AI 한도** — 설정 › AI에서 "AI Search 하루 15회 / debateAI 문제당 10회 / 면접관 제한 없음"이
      보인다. 개인 키를 등록하면 "사용 한도 없음"으로 바뀐다.
- [ ] **로그인 필수** — 비로그인으로 `/api/debateai`·`/api/ai-search/ask` 호출 시 **401 JSON**
      (로그인 페이지 HTML이 아니다).
- [ ] **번역** — 비로그인 화면에서 언어 전환 시 사전 항목만 번역되고 나머지는 원문으로 남는다.
- [ ] **탈퇴** — 2차 인증이 없는 계정은 종전대로 문구 입력만으로 탈퇴된다.
- [ ] **로그인 2차 인증** — 2차 인증을 켜지 않은 계정은 종전과 똑같이 바로 들어간다
      (없는 수단을 요구해 아무도 못 들어오는 상태가 아닌지 반드시 확인).
- [ ] **로그인 폼** — JS를 끄고 `/login`에서 제출해도 주소창에 `?email=…&password=…`가
      **붙지 않는다**(POST로 나간다).

## 6. 배포

```bash
npm run deploy         # 또는 main에 push → GitHub Actions
```

## 7. 배포 직후

- [ ] `curl https://<도메인>/api/health` → `{"ok":true}`
- [ ] 문제 하나를 실제로 **제출**해 통과 처리되고 포인트가 쌓이는지 (채점 경로가 바뀌었다)
- [ ] AI Search에 한 번 질문 → 답이 오고, 설정 › AI의 "오늘 사용" 수치가 1 오른다
- [ ] 2차 인증을 켠 계정으로 로그인 → `/login/verify`를 거쳐 들어간다
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
