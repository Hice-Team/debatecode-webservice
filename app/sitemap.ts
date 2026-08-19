import type { MetadataRoute } from 'next';
import { prisma } from '@/app/lib/prisma';

// 사이트맵 — 검색 엔진과 AI 검색 봇이 무엇을 읽어야 하는지 알려 준다.
//
// 공개 화면만 싣는다. 로그인해야 보이는 곳(대시보드·설정·콘솔)은 robots.ts에서도 막았고
// 여기에도 넣지 않는다. 목록에 있는데 못 들어가는 주소는 크롤러에게 오류로 남을 뿐이다.
//
// 문제·글은 수가 많아 상한을 둔다. 사이트맵의 목적은 전수 나열이 아니라 진입점 제공이다.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://debatecode.org';
const MAX_ROWS = 500;

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/problems', priority: 0.9, changeFrequency: 'daily' },
  { path: '/contests', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/study', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/community', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/hall-of-fame', priority: 0.6, changeFrequency: 'daily' },
  { path: '/shop', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/debate-mate', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/login', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/signup', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/legal/terms', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/legal/privacy', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/legal/ai-terms', priority: 0.2, changeFrequency: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // DB가 준비되지 않은 환경(빌드 시점 등)에서도 정적 경로는 나가야 한다
  const [problems, sets, posts] = await Promise.all([
    prisma.problem
      .findMany({ orderBy: { id: 'desc' }, take: MAX_ROWS, select: { id: true } })
      .catch(() => []),
    prisma.problemSet
      .findMany({ where: { published: true }, take: MAX_ROWS, select: { slug: true, updatedAt: true } })
      .catch(() => []),
    prisma.post
      .findMany({
        where: { secret: false },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: { id: true, createdAt: true, updatedAt: true },
      })
      .catch(() => []),
  ]);

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: `${SITE_URL}${route.path}`,
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...problems.map((p) => ({
      url: `${SITE_URL}/problems/${p.id}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...sets.map((s) => ({
      url: `${SITE_URL}/contests/${s.slug}`,
      lastModified: s.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...posts.map((post) => ({
      url: `${SITE_URL}/community/${post.id}`,
      lastModified: post.updatedAt ?? post.createdAt,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ];
}
