import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/app/components/nav';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { type Permission } from '@/app/lib/permissions';
import { effectivePermissions } from '@/app/lib/permissions-server';
import { roleLabel } from '@/app/lib/roles';
import { maintenanceState } from '@/app/lib/settings';
import ConsoleSidebar, { type SidebarItem } from './console-sidebar';

export const metadata: Metadata = { title: { default: '관리 콘솔', template: '%s · 관리 콘솔' } };

// 관리 콘솔 레이아웃 — /dashboard(개인 대시보드)와 분리된 운영 전용 화면.
// 좌측 사이드바 + 본문.
//
// 메뉴 노출은 역할이 아니라 **실효 권한**으로 정한다. 개별 권한 오버라이드로 딱 한 가지만
// 열어 준 계정에게도 그 화면 하나가 정확히 보여야 하기 때문이다.
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const { granted } = await effectivePermissions(user.id, user.role);
  if (!granted.has('console.access')) redirect('/dashboard');

  const has = (p: Permission) => granted.has(p);

  // 사이드바 대기 배지 — 페이지를 옮길 때마다 최신 카운트로 갱신된다.
  // 볼 권한이 없는 큐는 세지도 않는다(불필요한 쿼리 + 없는 숫자를 보여 주지 않기 위해).
  const [pendingDrafts, pendingMates, pendingReports, openInquiries, pendingPoints, openAppeals, maintenance] =
    await Promise.all([
      has('problem.review') ? prisma.problemDraft.count({ where: { status: 'pending' } }) : 0,
      has('mate.review') ? prisma.debateMateApplication.count({ where: { status: 'pending' } }) : 0,
      has('report.review') ? prisma.report.count({ where: { status: 'pending' } }) : 0,
      has('inquiry.respond') ? prisma.inquiry.count({ where: { status: 'open' } }) : 0,
      has('point.review')
        ? // 활동 인증 심사 + 쿠폰 발급 대기를 하나의 배지로 합친다
          Promise.all([
            prisma.pointRequest.count({ where: { status: 'pending' } }),
            prisma.shopOrder.count({ where: { status: 'requested' } }),
          ]).then(([a, b]) => a + b)
        : 0,
      has('sanction.lift') ? prisma.sanction.count({ where: { appealStatus: 'pending' } }) : 0,
      maintenanceState(),
    ]);

  // 라벨은 사전 키만 넘긴다 — 표시 언어는 사이드바가 이용자 설정을 보고 정한다.
  const items: SidebarItem[] = [
    { href: '/console', labelKey: 'console-nav-overview', icon: 'overview', group: 'operations', exact: true },
    ...opt(has('report.review'), { href: '/console/reports', labelKey: 'console-nav-report', icon: 'report', count: pendingReports, group: 'operations' }),
    ...opt(has('inquiry.respond'), { href: '/console/inquiries', labelKey: 'console-nav-inquiry', icon: 'inquiry', count: openInquiries, group: 'operations' }),
    ...opt(has('problem.review'), { href: '/console/problem-review', labelKey: 'console-nav-review', icon: 'review', count: pendingDrafts, group: 'operations' }),
    ...opt(has('mate.review'), { href: '/console/mates', labelKey: 'console-nav-mate', icon: 'mate', count: pendingMates, group: 'operations' }),
    ...opt(has('point.review'), { href: '/console/points', labelKey: 'console-nav-points', icon: 'points', count: pendingPoints, group: 'operations' }),

    ...opt(has('problem.review') || has('problem.manage'), { href: '/console/problems', labelKey: 'console-nav-upload', icon: 'upload', group: 'content' }),
    ...opt(has('problem.author'), { href: '/console/drafts', labelKey: 'console-nav-drafts', icon: 'drafts', group: 'content' }),
    ...opt(has('problemset.manage'), { href: '/console/problem-sets', labelKey: 'console-nav-sets', icon: 'sets', group: 'content' }),
    ...opt(has('shop.manage'), { href: '/console/shop', labelKey: 'console-nav-shop', icon: 'shop', group: 'content' }),
    ...opt(has('announcement.manage'), { href: '/console/popups', labelKey: 'console-nav-popup', icon: 'popup', group: 'content' }),

    ...opt(has('member.read'), { href: '/console/access', labelKey: 'console-nav-access', icon: 'access', group: 'access', exact: true }),
    ...opt(has('member.read'), { href: '/console/access/directory', labelKey: 'console-nav-directory', icon: 'members', group: 'access' }),
    ...opt(has('role.grant') || has('permission.grant'), { href: '/console/access/roles', labelKey: 'console-nav-roles', icon: 'roles', group: 'access' }),
    ...opt(has('sanction.issue') || has('sanction.lift'), { href: '/console/access/sanctions', labelKey: 'console-nav-sanctions', icon: 'sanction', count: openAppeals, group: 'access' }),
    ...opt(has('audit.read'), { href: '/console/access/audit', labelKey: 'console-nav-audit', icon: 'audit', group: 'access' }),

    ...opt(has('marketing.send'), { href: '/console/marketing', labelKey: 'console-nav-marketing', icon: 'marketing', group: 'growth' }),

    ...opt(has('setting.read'), { href: '/console/system', labelKey: 'console-nav-system', icon: 'system', group: 'system', exact: true }),
    ...opt(has('setting.write'), { href: '/console/system/settings', labelKey: 'console-nav-settings', icon: 'settings', group: 'system' }),
    ...opt(has('maintenance.toggle'), { href: '/console/system/maintenance', labelKey: 'console-nav-maintenance', icon: 'maintenance', group: 'system' }),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink-soft">
      <Nav />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ConsoleSidebar
          items={items}
          userName={user.name}
          roleName={roleLabel(user.role)}
          maintenanceOn={maintenance.enabled}
        />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** 조건부 항목을 스프레드로 끼워 넣기 위한 헬퍼 — 삼항 + as 캐스팅 반복을 줄인다. */
function opt(show: boolean, item: SidebarItem): SidebarItem[] {
  return show ? [item] : [];
}
