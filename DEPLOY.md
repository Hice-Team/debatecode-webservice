# Cloudflare Workers 배포 (OpenNext)

https://opennext.js.org/cloudflare 어댑터로 Cloudflare Workers에 배포한다.
세팅은 완료되어 있다: [wrangler.jsonc](wrangler.jsonc) · [open-next.config.ts](open-next.config.ts) ·
`next.config.ts`의 `initOpenNextCloudflareForDev()` · package.json `preview`/`deploy` 스크립트.

> **주의: Windows에서는 `opennextjs-cloudflare build`가 크래시한다 (OpenNext 공식 Windows 비호환).**
> 배포 빌드는 **WSL(Ubuntu) 또는 CI(리눅스 러너)** 에서 실행할 것.

## 1회 준비

```bash
npx wrangler login          # Cloudflare 계정 연결
```

시크릿 등록 (프로덕션 환경변수 — `.env`의 값들):

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put DIRECT_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
npx wrangler secret put AI_SECRET_KEY
npx wrangler secret put AI_SECRET_KEY_2     # API 키 이중암호화 2차 키 (권장)
npx wrangler secret put AI_BUILTIN_PROVIDER
npx wrangler secret put AI_BUILTIN_MODEL
npx wrangler secret put AI_BUILTIN_API_KEY
# Debate Free AI 업스트림 (있는 키의 모델만 사용됨)
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GOOGLE_AI_API_KEY
npx wrangler secret put GROK_API_KEY
npx wrangler secret put HUGGINGFACE_API_KEY
```

로컬 미리보기용으로는 `.dev.vars` 파일(gitignore됨)에 같은 키를 넣는다.

## 배포

```bash
npm run preview   # 로컬 workerd에서 프로덕션 빌드 미리보기
npm run deploy    # 빌드 + Cloudflare Workers 배포
```

- Prisma는 Workers용으로 `engineType = "client"`(Rust-free)로 이미 설정되어 있다.
- DB 마이그레이션은 배포와 별개로 `prisma/manual-additive.sql`을 Supabase에 적용한다
  (`npx prisma db execute --file prisma/manual-additive.sql --schema prisma/schema.prisma`).
