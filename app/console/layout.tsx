import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/app/components/nav';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { hasConsoleAccess, canReview, canAuthorProblems, canGrantRoles, canManagePublishedContent, roleLabel } from '@/app/lib/roles';
import ConsoleSidebar, { type SidebarItem } from './console-sidebar';

export const metadata: Metadata = { title: { default: '관리 콘솔', template: '%s · 관리 콘솔' } };

// 관리 콘솔 레이아웃 — /dashboard(개인 대시보드)와 분리된 운영 전용 화면.
// 좌측 사이드바 + 본문. 접근은 콘솔 권한 역할(일반 사용자 제외)만.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!hasConsoleAccess(user.role)) redirect('/dashboard');

  const reviewer = canReview(user.role);
  const author = canAuthorProblems(user.role);
  const isAdmin = user.role === 'admin';
  const showMembers = isAdmin || user.role === 'reviewer';

  // 사이드바 대기열 배지 — 페이지 이동마다 최신 카운트로 갱신된다
  const [pendingDrafts, pendingMates, pendingReports, openInquiries, pendingPoints] = reviewer
    ? await Promise.all([
        prisma.problemDraft.count({ where: { status: 'pending' } }),
        prisma.debateMateApplication.count({ where: { status: 'pending' } }),
        prisma.report.count({ where: { status: 'pending' } }),
        prisma.inquiry.count({ where: { status: 'open' } }),
        // 활동 인증 심사 + 쿠폰 발급 대기를 하나의 배지로 합친다
        Promise.all([
          prisma.pointRequest.count({ where: { status: 'pending' } }),
          prisma.shopOrder.count({ where: { status: 'requested' } }),
        ]).then(([a, b]) => a + b),
      ])
    : [0, 0, 0, 0, 0];

  // 라벨은 사전 키만 넘긴다 — 표시 언어는 사이드바가 이용자 설정을 보고 정한다.
  // group은 화면에서 묶음 헤딩이 된다(운영 / 콘텐츠 / 성장).
  const items: SidebarItem[] = [
    { href: '/console', labelKey: 'console-nav-overview', icon: 'overview', group: 'operations' },
    ...(reviewer
      ? ([
          { href: '/console/problem-review', labelKey: 'console-nav-review', icon: 'review', count: pendingDrafts, group: 'operations' },
          { href: '/console/mates', labelKey: 'console-nav-mate', icon: 'mate', count: pendingMates, group: 'operations' },
          { href: '/console/reports', labelKey: 'console-nav-report', icon: 'report', count: pendingReports, group: 'operations' },
          { href: '/console/inquiries', labelKey: 'console-nav-inquiry', icon: 'inquiry', count: openInquiries, group: 'operations' },
          { href: '/console/points', labelKey: 'console-nav-points', icon: 'points', count: pendingPoints, group: 'operations' },
        ] as SidebarItem[])
      : []),
    ...(author ? ([{ href: '/console/drafts', labelKey: 'console-nav-drafts', icon: 'drafts', group: 'content' }] as SidebarItem[]) : []),
    ...(canManagePublishedContent(user.role)
      ? ([
          { href: '/console/problem-sets', labelKey: 'console-nav-sets', icon: 'sets', group: 'content' },
          { href: '/console/shop', labelKey: 'console-nav-shop', icon: 'shop', group: 'content' },
        ] as SidebarItem[])
      : []),
    ...(showMembers ? ([{ href: '/console/members', labelKey: 'console-nav-members', icon: 'members', group: 'growth' }] as SidebarItem[]) : []),
    ...(canGrantRoles(user.role)
      ? ([
          { href: '/console/popups', labelKey: 'console-nav-popup', icon: 'popup', group: 'growth' },
          { href: '/console/marketing', labelKey: 'console-nav-marketing', icon: 'marketing', group: 'growth' },
        ] as SidebarItem[])
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink-soft">
      <Nav />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ConsoleSidebar items={items} userName={user.name} roleName={roleLabel(user.role)} />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
