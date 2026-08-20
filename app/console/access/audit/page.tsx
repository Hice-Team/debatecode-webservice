import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Prisma } from '@/app/generated/prisma';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { AUDIT_ACTIONS, auditActionLabel } from '@/app/lib/audit';
import { roleLabel } from '@/app/lib/roles';
import { PageHeader, EmptyState, Callout, FOCUS, BTN_NEUTRAL } from '../../ui';

export const metadata: Metadata = { title: '감사 로그' };

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

// 액션을 앞부분(도메인)으로 묶어 필터 드롭다운을 만든다 — 30개가 넘는 평평한 목록은 못 고른다
const DOMAINS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'role', label: '역할' },
  { value: 'permission', label: '권한' },
  { value: 'sanction', label: '제재' },
  { value: 'report', label: '신고' },
  { value: 'inquiry', label: '문의' },
  { value: 'problem', label: '문제' },
  { value: 'mate', label: '메이트' },
  { value: 'setting', label: '설정' },
  { value: 'maintenance', label: '유지보수' },
  { value: 'macro', label: '매크로' },
];

const PERIODS = [
  { value: '1', label: '최근 24시간' },
  { value: '7', label: '최근 7일' },
  { value: '30', label: '최근 30일' },
  { value: '0', label: '전체 기간' },
];

// 감사 로그 — 콘솔에서 일어난 모든 변경.
//
// 필터는 전부 URL 쿼리로 둔다. 조사 중에 링크를 그대로 다른 운영자에게 넘길 수 있어야 한다.
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; actor?: string; q?: string; days?: string; page?: string }>;
}) {
  const user = await getUser();
  if (!(await can(user, 'audit.read'))) redirect('/console');

  const params = await searchParams;
  const domain = DOMAINS.some((d) => d.value === params.domain) ? params.domain! : 'all';
  const days = PERIODS.some((p) => p.value === params.days) ? params.days! : '7';
  const q = (params.q ?? '').trim();
  const page = Math.max(1, Number(params.page ?? 1) || 1);

  const where: Prisma.AuditLogWhereInput = {};
  if (domain !== 'all') {
    // 'role' → role.change, role.change.bulk … 도메인 접두어로 묶는다
    where.action = { startsWith: `${domain}.` };
  }
  if (days !== '0') {
    where.createdAt = { gte: new Date(new Date().getTime() - Number(days) * 86400_000) };
  }
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: 'insensitive' } },
      { actorName: { contains: q, mode: 'insensitive' } },
      { targetId: q },
    ];
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog
      .findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE })
      .catch(() => []),
    prisma.auditLog.count({ where }).catch(() => 0),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkFor = (next: Record<string, string>) => {
    const sp = new URLSearchParams({ domain, days, ...(q ? { q } : {}), ...next });
    return `/console/access/audit?${sp.toString()}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="AUDIT LOG"
        title="감사 로그"
        sub="콘솔에서 일어난 모든 상태 변경입니다. 행위자 이름과 역할은 그 시점의 값으로 고정돼 있습니다."
      />

      <div className="mb-4">
        <Callout tone="info" title="이 기록은 지워지지 않습니다">
          되돌릴 근거이자 이의제기 대응 자료입니다. 필터 상태가 주소에 담기므로, 조사 중인 화면을 링크로 그대로 공유할
          수 있습니다.
        </Callout>
      </div>

      {/* 필터 — GET 폼이라 결과가 주소에 남는다 */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-[var(--radius-panel)] border border-hairline bg-white p-4">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="audit-q" className="mb-1.5 block font-mono text-[11px] tracking-wider text-fg-muted">
            검색 (내용·행위자·대상 ID)
          </label>
          <input
            id="audit-q"
            name="q"
            defaultValue={q}
            placeholder="예: 제재 / 강*호 / cmxxxx"
            className={`w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm ${FOCUS}`}
          />
        </div>
        <div>
          <label htmlFor="audit-domain" className="mb-1.5 block font-mono text-[11px] tracking-wider text-fg-muted">
            영역
          </label>
          <select
            id="audit-domain"
            name="domain"
            defaultValue={domain}
            className={`rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm ${FOCUS}`}
          >
            {DOMAINS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-days" className="mb-1.5 block font-mono text-[11px] tracking-wider text-fg-muted">
            기간
          </label>
          <select
            id="audit-days"
            name="days"
            defaultValue={days}
            className={`rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm ${FOCUS}`}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
          적용
        </button>
        {(q || domain !== 'all' || days !== '7') && (
          <Link href="/console/access/audit" className={BTN_NEUTRAL}>
            초기화
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
        {entries.length === 0 ? (
          <EmptyState
            title="조건에 맞는 기록이 없습니다"
            sub="기간을 넓히거나 영역 필터를 해제해 보세요."
          />
        ) : (
          <ul className="divide-y divide-ink/5">
            {entries.map((entry) => (
              <li key={entry.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      entry.action.startsWith('sanction.') || entry.action.startsWith('role.')
                        ? 'bg-rose-100 text-rose-800'
                        : entry.action.startsWith('maintenance.') || entry.action.startsWith('setting.')
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-ink/[0.06] text-fg-muted'
                    }`}
                  >
                    {auditActionLabel(entry.action)}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm text-fg">{entry.summary}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                    {entry.actorName}({roleLabel(entry.actorRole)})
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-quiet">
                    {entry.createdAt.toLocaleString('ko-KR')}
                  </span>
                </div>
                {(entry.targetId || entry.ipMasked) && (
                  <p className="mt-1 font-mono text-[10px] text-fg-quiet">
                    {entry.targetType && `${entry.targetType}:${entry.targetId ?? '—'}`}
                    {entry.ipMasked && ` · ${entry.ipMasked}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
          <p className="font-mono text-[11px] text-fg-muted">
            {total.toLocaleString()}건 중 {entries.length}건 표시
          </p>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link href={linkFor({ page: String(page - 1) })} className={BTN_NEUTRAL}>
                이전
              </Link>
            )}
            <span className="font-mono text-sm">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link href={linkFor({ page: String(page + 1) })} className={BTN_NEUTRAL}>
                다음
              </Link>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] text-fg-quiet">
        기록되는 액션 {Object.keys(AUDIT_ACTIONS).length}종
      </p>
    </div>
  );
}
