import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // 우리가 쓰지 않은 코드는 검사하지 않는다.
    // Prisma가 뱉는 클라이언트(1,100개가 넘는 any·빈 인터페이스)까지 세면
    // 빌드가 통과할 수 없고, 통과시키려고 규칙을 끄면 우리 코드의 문제까지 함께 가려진다.
    // `prisma generate`를 돌릴 때마다 새로 만들어지므로 고칠 수도 없다.
    "app/generated/**",
    // OpenNext 빌드 산출물
    ".open-next/**",

    // AI 코딩 도구 설치물 — 우리가 작성한 코드가 아니고 앱 번들에도 들어가지 않는다.
    // (oh-my-design 훅/스크립트, hallmark 스킬 문서, Cursor 룰)
    ".claude/**",
    ".agents/**",
    ".cursor/**",
    ".codex/**",
  ]),

  {
    rules: {
      // `_`로 시작하는 이름은 "쓰지 않을 것을 알고 남겨 둔 자리"라는 뜻으로 이미 쓰고 있다.
      // 시그니처를 맞추려고 받는 인자(_board, _role)나 구조분해에서 버리는 값(_s)이 그렇다.
      // 규칙이 이 관례를 모르면 개발자는 경고를 지우려고 이름을 더 이상하게 바꾸게 된다.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // next/image를 쓰지 않는 것은 실수가 아니라 결정이다.
      //
      // 이 앱이 그리는 이미지는 전부 이용자가 올린 것이거나 외부 주소다(Supabase Storage의
      // 서명 URL, 커뮤니티 첨부, 상품 사진, 아바타). next/image로 최적화하려면
      //   1) 도메인마다 remotePatterns를 등록해야 하는데 서명 URL은 쿼리가 매번 바뀌고,
      //   2) Cloudflare Workers 배포에서는 이미지 최적화가 별도 과금 대상이다.
      // 최적화가 필요해지는 시점이 오면 그때 loader를 붙이는 편이 낫다.
      '@next/next/no-img-element': 'off',

      // App Router에서는 오탐이다. 이 규칙은 pages/_document.js를 전제로 하는데
      // 이 저장소에는 pages 디렉터리가 없고, 폰트는 app/layout.tsx의 <head>에서
      // preconnect와 함께 한 번만 불러온다.
      '@next/next/no-page-custom-font': 'off',
    },
  },
]);

export default eslintConfig;
