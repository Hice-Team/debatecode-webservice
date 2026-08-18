import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { permissionLabel } from '@/app/lib/permissions';
import { ROLES, ROLE_LABELS, ROLE_BADGE, type Role } from '@/app/lib/roles';
import { maskName } from '@/app/lib/privacy';
import { sanctionTypeLabel } from '@/app/lib/sanctions';
import { auditActionLabel } from '@/app/lib/audit';
import { PageHeader, StatGrid, Callout, EmptyRow, SlaBadge } from '../ui';

export const metadata: Metadata = { title: '접근 제어' };

// 접근 제어 개요 — 지금 누가 어떤 권한을 갖고 있고, 무엇이 제한돼 있는지.
//
// 이전 구조에서는 이 정보가 회원 목록 안에 흩어져 있어서, "관리자가 몇 명인가",
// "만료 임박한 제재가 있나" 같은 질문에 표를 스크롤하며 답해야 했다.
export default async function AccessOverviewPage() {
  const user = await getUser();
  if (!(await can(user, 'member.read'))) redirect('/console');

  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 86400_000);

  const [roleCounts, activeSanctions, expiringSoon, pendingAppeals, grants, recentAccessAudit, totalUsers] =
    await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.sanction.count({ where: { active: true } }),
      prisma.sanction.findMany({
        where: { active: true, expiresAt: { gt: now, lt: soon } },
        orderBy: { expiresAt: 'asc' },
        take: 5,
        select: { id: true, type: true, expiresAt: true, user: { select: { name: true } } },
      }),
      prisma.sanction.count({ where: { appealStatus: 'pending' } }),
      prisma.permissionGrant.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          permission: true,
          effect: true,
          expiresAt: true,
          user: { select: { id: true, name: true, role: true } },
        },
      }),
      prisma.auditLog
        .findMany({
          where: { action: { startsWith: 'role.' } },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { id: true, action: true, actorName: true, summary: true, createdAt: true },
        })
        .catch(() => []),
      prisma.user.count(),
    ]);

  const countByRole = new Map(roleCounts.map((r) => [r.role, r._count._all]));
  const adminCount = countByRole.get('admin') ?? 0;
  const consoleCount = ROLES.filter((r) => r !== 'user').reduce((sum, r) => sum + (countByRole.get(r) ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="ACCESS CONTROL"
        title="접근 제어"
        sub="역할 분포, 개별 권한 오버라이드, 활성 제재를 한 화면에서 봅니다."
      />

      <div className="mb-5 space-y-2">
        {adminCount === 1 && (
          <Callout tone="warn" title="최고관리자가 1명뿐입니다">
            이 계정을 잃으면 권한을 되돌릴 방법이 없습니다. 신뢰할 수 있는 계정 하나를 더 최고관리자로 지정해 두는
            것을 권장합니다.
          </Callout>
        )}
        {pendingAppeals > 0 && (
          <Callout tone="danger" title={`처리 대기 중인 이의제기 ${pendingAppeals}건`}>
            <Link href="/console/access/sanctions?tab=appeals" className="font-semibold underline underline-offset-2">
              제재 센터에서 처리하기 →
            </Link>
          </Callout>
        )}
      </div>

      <StatGrid
        stats={[
          { label: '전체 회원', value: totalUsers },
          { label: '콘솔 접근 계정', value: consoleCount, sub: `최고관리자 ${adminCount}명` },
          { label: '활성 제재', value: activeSanctions, warn: activeSanctions > 0 },
          { label: '권한 오버라이드', value: grants.length ? `${grants.length}+` : 0 },
        ]}
      />

      {/* 역할 분포 */}
      <section className="mt-8">
        <h3 className="mb-3 text-lg font-bold text-ink">역할 분포</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((role) => (
            <Link
              key={role}
              href={`/console/access/directory?role=${role}`}
              className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
            >
              <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] ${ROLE_BADGE[role as Role]}`}>
                {ROLE_LABELS[role as Role]}
              </span>
              <span className="ml-auto font-display text-2xl font-bold text-ink">{countByRole.get(role) ?? 0}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {/* 개별 권한 오버라이드 */}
        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3">
            <h3 className="text-sm font-bold text-ink">개별 권한 오버라이드</h3>
            <Link href="/console/access/roles" className="font-mono text-[11px] text-brand-600 hover:underline">
              관리 →
            </Link>
          </div>
          {grants.length === 0 ? (
            <EmptyRow text="역할 기본값을 벗어난 계정이 없습니다." />
          ) : (
            <ul className="divide-y divide-ink/5">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center gap-2.5 px-5 py-2.5">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                      g.effect === 'allow' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {g.effect === 'allow' ? '허용' : '차단'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-soft/75">
                    {maskName(g.user.name)} · {permissionLabel(g.permission)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-soft/35">
                    {g.expiresAt ? `~${g.expiresAt.toLocaleDateString('ko-KR')}` : '무기한'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 만료 임박 제재 */}
        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3">
            <h3 className="text-sm font-bold text-ink">3일 내 만료되는 제재</h3>
            <Link href="/console/access/sanctions" className="font-mono text-[11px] text-brand-600 hover:underline">
              제재 센터 →
            </Link>
          </div>
          {expiringSoon.length === 0 ? (
            <EmptyRow text="곧 만료되는 제재가 없습니다." />
          ) : (
            <ul className="divide-y divide-ink/5">
              {expiringSoon.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 px-5 py-2.5">
                  <span className="shrink-0 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[9px] text-rose-700">
                    {sanctionTypeLabel(s.type)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-soft/75">{maskName(s.user.name)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-soft/45">
                    {s.expiresAt?.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 최근 권한 변경 */}
      <section className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3">
          <h3 className="text-sm font-bold text-ink">최근 역할 변경</h3>
          <Link href="/console/access/audit" className="font-mono text-[11px] text-brand-600 hover:underline">
            감사 로그 전체 →
          </Link>
        </div>
        {recentAccessAudit.length === 0 ? (
          <EmptyRow text="역할이 변경된 기록이 없습니다." />
        ) : (
          <ul className="divide-y divide-ink/5">
            {recentAccessAudit.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2.5 px-5 py-2.5">
                <span className="shrink-0 rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink-soft/55">
                  {auditActionLabel(entry.action)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-soft/75">{entry.summary}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-soft/35">{entry.actorName}</span>
                <SlaBadge since={entry.createdAt} done />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
