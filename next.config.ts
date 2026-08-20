import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// `next dev`에서 Cloudflare 바인딩(process.env 등)을 흉내내도록 초기화한다.
initOpenNextCloudflareForDev();

const isDev = process.env.NODE_ENV !== "production";

// 문서(페이지) CSP — Monaco 로더는 cdn.jsdelivr.net에서 로드되고 blob: 워커를 만든다.
// 커뮤니티 첨부 이미지·아바타는 임의의 https URL, 유튜브 임베드는 frame-src로 허용.
// Next의 인라인 런타임 스크립트 때문에 script-src 'unsafe-inline'은 유지한다(논스 미도입).
const documentCsp = [
  "default-src 'self'",
  // cdn.channel.io / *.channel.io — 채널톡 SDK (커뮤니티/대시보드/설정/온보딩 상담 위젯)
  // apis.google.com / accounts.google.com — AI Search 첨부의 "Drive에서 파일 추가"(Google Picker)
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.channel.io https://apis.google.com https://accounts.google.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.channel.io https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net https://cdn.channel.io",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://*.channel.io wss://*.channel.io https://www.googleapis.com https://accounts.google.com",
  "worker-src 'self' blob:",
  // supabase.co — 첨부 미리보기의 PDF는 <iframe>으로 연다. 프록시(/api/ai-search/file)가
  // 서명 URL로 302를 보내므로, 최종 목적지인 스토리지 도메인이 여기 있어야 프레임이 뜬다.
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://*.channel.io https://docs.google.com https://accounts.google.com https://content.googleapis.com https://*.supabase.co",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// 채점 워커(/judge/*.js) 전용 CSP — 워커는 자기 응답 헤더의 CSP를 따른다.
// Pyodide가 CDN에서 importScripts + WASM 컴파일 + 패키지 fetch를 하므로 별도로 완화.
const judgeWorkerCsp = [
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval' 'wasm-unsafe-eval'",
  "connect-src https://cdn.jsdelivr.net",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: documentCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // microphone=(self) — AI Search 음성 입력(받아쓰기)이 같은 출처에서만 마이크를 쓴다.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  // HTTPS 배포 전제 — 로컬 http 개발에는 브라우저가 무시한다.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 커뮤니티 첨부(파일/이미지 최대 10MB × 복수)를 서버 액션으로 받는다 — 기본 1MB로는 업로드 실패
      bodySizeLimit: "25mb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/judge/:path*",
        headers: [{ key: "Content-Security-Policy", value: judgeWorkerCsp }],
      },
    ];
  },
};

export default nextConfig;