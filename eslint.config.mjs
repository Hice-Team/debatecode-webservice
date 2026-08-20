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
]);

export default eslintConfig;
