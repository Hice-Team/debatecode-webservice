# Pre-deploy Checklist

마지막 배포 전 점검 목록 (로컬 또는 CI에서 실행):

1. 환경
- `.env` 또는 Cloudflare Secret에 모든 필수 키가 설정되었는지 확인하세요.
  - `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `AI_SECRET_KEY`, 등.
- WebAuthn 관련 (선택적): `NEXT_PUBLIC_WEBAUTHN_RPID`, `NEXT_PUBLIC_WEBAUTHN_ORIGIN` 설정.

2. 의존성 & 보안
```bash
npm install
npm audit fix --force    # CI에서만 권장: 필요시 수동 검토
```

3. 데이터베이스
- 마이그레이션을 적용(로컬/스테이징):
```bash
npx prisma migrate deploy
# 또는 개발 중이면
npx prisma migrate dev --name final-prep
```
- 또는 추가 SQL이 있다면 수동 적용:
```bash
npx prisma db execute --file prisma/manual-additive.sql --schema prisma/schema.prisma
```

4. 정적 검사/빌드
```bash
npm run build
# 빌드 오류가 없으면 로컬 preview로 확인
npm run preview
```

5. 런타임 점검 (스모크 테스트)
- `/settings` → 보안/2FA 흐름(Provision/Verify) 스모크
- `/community` → 게시글 리스트, 댓글 작성/답글, 댓글 편집/삭제
- `/console` → 관리자 로그인, 회원 관리(권한 변경), 제재/해제

6. 배포
- OpenNext + Wrangler로 Cloudflare Workers에 배포 (권장: WSL 또는 CI 리눅스 러너에서 실행)
```bash
npm run deploy
```

7. 모니터링
- 배포 후 주요 로그/에러(Workers 로그, DB 연결, 외부 API 응답)를 모니터링하세요.

문제가 있을 경우, 변경된 서버 액션이나 Prisma 스키마가 원인인 경우가 많습니다. 오류 로그와 Prisma 마이그레이션 상태를 먼저 확인하세요.
