import type { MetadataRoute } from 'next';

// 크롤러 정책 — "검색되고 인용되는 것"과 "대신 조작당하는 것"을 가른다.
//
// 세 갈래로 나눈다.
//   1) 검색·답변 봇   허용. 디베이트코드를 찾아 오고, 답변에 인용하는 것은 서비스에 이롭다.
//                     (Googlebot·Bingbot과 AI 검색 계열 OAI-SearchBot·PerplexityBot)
//   2) 에이전트 봇    차단. 이용자를 대신해 화면을 눌러 다니는 부류다. 로그인·제출·포인트 차감처럼
//                     결과가 남는 동작을 사람이 아닌 것이 수행하게 둘 수 없다.
//   3) 학습 수집 봇   차단. 커뮤니티 글과 풀이는 작성자의 것이고, 학습 활용 동의는 서비스 안에서
//                     따로 받는다. robots로 일괄 수집되는 경로를 열어 둘 이유가 없다.
//
// robots.txt는 규약이지 강제가 아니다. 실제 차단은 미들웨어의 UA 검사·레이트리밋과 함께 가야 한다.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://debatecode.kr';

/** 어떤 봇에게도 열지 않는 경로 — 로그인 뒤 화면과 결과가 남는 동작들 */
const PRIVATE_PATHS = [
  '/api/',
  '/dashboard',
  '/console',
  '/settings',
  '/shop/orders',
  '/debate-mate/console',
  '/problems/mine',
  '/problems/new',
  '/onboarding',
  '/auth/',
  '/reset-password',
  '/forgot-password',
];

/** 검색 결과에 띄우고 답변에 인용해도 되는 봇 */
const SEARCH_BOTS = ['Googlebot', 'Bingbot', 'DuckDuckBot', 'OAI-SearchBot', 'PerplexityBot', 'Applebot'];

/**
 * 이용자를 대신해 페이지를 조작하는 에이전트, 그리고 학습 데이터 수집기.
 * 앞의 것은 "웹 조작 금지", 뒤의 것은 "무단 수집 금지"라 이유는 다르지만 결론은 같다.
 */
const BLOCKED_BOTS = [
  // 에이전트 — 사람 대신 클릭·입력한다
  'ChatGPT-User',
  'OAI-Operator',
  'Claude-User',
  'Claude-SearchBot-User',
  'Perplexity-User',
  'Bytespider',
  // 학습 데이터 수집
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'CCBot',
  'Amazonbot',
  'Meta-ExternalAgent',
  'FacebookBot',
  'Applebot-Extended',
  'cohere-ai',
  'Diffbot',
  'Omgilibot',
  'Timpibot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // 검색·답변 봇 — 공개 화면은 전부 열되 로그인 영역은 닫는다
      { userAgent: SEARCH_BOTS, allow: '/', disallow: PRIVATE_PATHS },
      // 에이전트·수집 봇 — 전면 차단
      { userAgent: BLOCKED_BOTS, disallow: '/' },
      // 그 밖의 봇 — 공개 화면만
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
