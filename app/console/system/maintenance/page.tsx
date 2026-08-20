import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { can } from '@/app/lib/permissions-server';
import { maintenanceState } from '@/app/lib/settings';
import { auditActionLabel } from '@/app/lib/audit';
import MaintenanceForm from './maintenance-form';
import { PageHeader, SectionHeader, EmptyRow } from '../../ui';

export const metadata: Metadata = { title: '유지보수 모드' };

export const dynamic = 'force-dynamic';

// 유지보수 모드 — 전면 장애나 위험한 마이그레이션 중에 서비스를 잠시 내린다.
export default async function MaintenancePage() {
  const user = await getUser();
  if (!(await can(user, 'maintenance.toggle'))) redirect('/console/system');

  const [state, history] = await Promise.all([
    maintenanceState(),
    // 켜고 끈 이력 — "언제부터 언제까지 내려가 있었나"를 나중에 답할 수 있어야 한다
    prisma.auditLog
      .findMany({
        where: { action: { in: ['maintenance.on', 'maintenance.off'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, action: true, actorName: true, summary: true, createdAt: true },
      })
      .catch(() => []),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="MAINTENANCE"
        title="유지보수 모드"
        sub="전면 장애나 위험한 작업 중에 서비스를 점검 화면으로 돌립니다. 운영진 계정은 영향을 받지 않습니다."
      />

      <MaintenanceForm enabled={state.enabled} message={state.message} eta={state.eta} />

      <div className="mt-10">
        <SectionHeader title="점검 이력" sub="최근 10건 — 켠 사람과 시각이 남습니다." />
        <div className="divide-y divide-ink/5 rounded-[var(--radius-panel)] border border-hairline bg-white">
          {history.length === 0 && <EmptyRow text="점검 모드를 사용한 이력이 없습니다." />}
          {history.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                  entry.action === 'maintenance.on'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {auditActionLabel(entry.action)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{entry.summary}</span>
              <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                {entry.actorName} · {entry.createdAt.toLocaleString('ko-KR')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
