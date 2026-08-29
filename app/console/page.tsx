import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { roleLabel } from '@/app/lib/roles';
import { effectivePermissions } from '@/app/lib/permissions-server';
import type { Permission } from '@/app/lib/permissions';
import { maintenanceState, getSettingsByCategory } from '@/app/lib/settings';
import { auditActionLabel } from '@/app/lib/audit';
import { AreaChart } from '@/app/components/charts';
import { Callout, SlaBadge } from './ui';

const DAYS = 14;

// dataviz 검증 통과 팔레트 (light surface, 3:1 대비 확보)
const SERIES_COLORS = { signup: '#4531d9', submission: '#0369a1', post: '#047857' };

// 최근 14일 일별 버킷 — createdAt 목록을 날짜 인덱스로 집계한다.
function bucketize(dates: Date[], start: Date): number[] {
  const out = new Array(DAYS).fill(0);
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - start.getTime()) / 86400000);
    if (idx >= 0 && idx < DAYS) out[idx]++;
  }
  return out;
}

/** 최근 7일 vs 직전 7일 증감률(%). 직전 구간이 0이면 비교 불가로 null. */
function weekOverWeek(points: number[]): number | null {
  const recent = points.slice(-7).reduce((a, b) => a + b, 0);
  const previous = points.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (previous === 0) return null;
  return Math.round(((recent - previous) / previous) * 100);
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const up = delta >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
      }`}
      title="최근 7일 vs 직전 7일"
    >
      {up ? '▲' : '▼'} {Math.abs(delta)}%
    </span>
  );
}

// 콘솔 개요 — 지금 손대야 할 일, 서비스 상태, 최근 14일 추세, 운영 활동.
//
// 화면 순서가 곧 우선순위다: ① 지금 이상한 것(점검 모드·꺼진 기능) → ② 처리 대기 큐 →
// ③ 지표 → ④ 활동. 예전 개요는 관리 도구 카드가 14개 깔려 있었는데, 그 역할은
// 사이드바가 이미 하고 있어 여기서는 뺐다.
export default async function ConsoleOverviewPage() {
  const user = await getUser();
  const { granted, extraAllows } = await effectivePermissions(user.id, user.role);
  const has = (p: Permission) => granted.has(p);

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (DAYS - 1));

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    totalSubmissions,
    totalPosts,
    completedInterviews,
    avgDefense,
    signupDates,
    submissionDates,
    postDates,
    pendingReports,
    openInquiries,
    pendingDrafts,
    pendingMates,
    pendingPoints,
    openAppeals,
    todaySignups,
    todaySubmissions,
    recentAudit,
    maintenance,
    flags,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.submission.count(),
    prisma.post.count(),
    prisma.interviewSession.count({ where: { status: 'COMPLETED' } }),
    prisma.interviewSession.aggregate({ _avg: { defenseScore: true }, where: { status: 'COMPLETED' } }),
    prisma.user.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.submission.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.post.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    has('report.review') ? prisma.report.count({ where: { status: 'pending' } }) : 0,
    has('inquiry.respond') ? prisma.inquiry.count({ where: { status: 'open' } }) : 0,
    has('problem.review') ? prisma.problemDraft.count({ where: { status: 'pending' } }) : 0,
    has('mate.review') ? prisma.debateMateApplication.count({ where: { status: 'pending' } }) : 0,
    has('point.review')
      ? Promise.all([
          prisma.pointRequest.count({ where: { status: 'pending' } }),
          prisma.shopOrder.count({ where: { status: 'requested' } }),
        ]).then(([a, b]) => a + b)
      : 0,
    has('sanction.lift') ? prisma.sanction.count({ where: { appealStatus: 'pending' } }) : 0,
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.submission.count({ where: { createdAt: { gte: todayStart } } }),
    has('audit.read')
      ? prisma.auditLog
          .findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { id: true, action: true, actorName: true, summary: true, createdAt: true },
          })
          .catch(() => [])
      : Promise.resolve([]),
    maintenanceState(),
    has('setting.read') ? getSettingsByCategory('flag') : Promise.resolve([]),
  ]);

  const labels = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const signupPoints = bucketize(signupDates.map((r) => r.createdAt), start);
  const submissionPoints = bucketize(submissionDates.map((r) => r.createdAt), start);
  const postPoints = bucketize(postDates.map((r) => r.createdAt), start);
  const traffic = [
    { label: '가입', color: SERIES_COLORS.signup, points: signupPoints },
    { label: '제출', color: SERIES_COLORS.submission, points: submissionPoints },
    { label: '게시글', color: SERIES_COLORS.post, points: postPoints },
  ];

  const avgDefenseScore = avgDefense._avg.defenseScore != null ? Math.round(avgDefense._avg.defenseScore) : null;

  const kpis = [
    { label: '전체 사용자', value: `${totalUsers}명`, sub: `오늘 신규 ${todaySignups}명`, delta: weekOverWeek(signupPoints) },
    { label: '총 제출', value: `${totalSubmissions}건`, sub: `오늘 ${todaySubmissions}건`, delta: weekOverWeek(submissionPoints) },
    { label: '총 게시글', value: `${totalPosts}개`, sub: '전체 게시판', delta: weekOverWeek(postPoints) },
    {
      label: '평균 방어율',
      value: avgDefenseScore != null ? `${avgDefenseScore}%` : '—',
      sub: `면접 ${completedInterviews}건 기준`,
      delta: null,
    },
  ];

  // 처리 대기 큐 — 지금 손대야 할 것만. 볼 권한이 있는 항목만 나온다.
  const queue = [
    { href: '/console/reports', label: '미처리 신고', count: pendingReports, show: has('report.review') },
    { href: '/console/inquiries', label: '미답변 문의', count: openInquiries, show: has('inquiry.respond') },
    { href: '/console/problem-review', label: '검토 대기 문제', count: pendingDrafts, show: has('problem.review') },
    { href: '/console/mates', label: '메이트 신청', count: pendingMates, show: has('mate.review') },
    { href: '/console/points', label: '포인트·주문', count: pendingPoints, show: has('point.review') },
    { href: '/console/access/sanctions?tab=appeals', label: '제재 이의제기', count: openAppeals, show: has('sanction.lift') },
  ].filter((q) => q.show);
  const queueTotal = queue.reduce((sum, q) => sum + q.count, 0);

  const offFlags = flags.filter((f) => f.overridden && f.value === false);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600">ADMIN CONSOLE</span>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-fg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            관리 콘솔
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {user.name}님 · {roleLabel(user.role)} 권한으로 접속 중
            {extraAllows.length > 0 && (
              <span className="ml-1.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                추가 권한 {extraAllows.length}건
              </span>
            )}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
          📅 {now.toLocaleDateString('ko-KR')}
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        </span>
      </div>

      {/* ① 지금 이상한 것 */}
      {(maintenance.enabled || offFlags.length > 0) && (
        <div className="mt-5 space-y-2">
          {maintenance.enabled && (
            <Callout tone="warn" title="유지보수 모드가 켜져 있습니다">
              일반 이용자에게는 점검 화면만 보입니다.{' '}
              <Link href="/console/system/maintenance" className="font-semibold underline underline-offset-2">
                해제하기 →
              </Link>
            </Callout>
          )}
          {offFlags.length > 0 && (
            <Callout tone="info" title={`꺼져 있는 기능 ${offFlags.length}개`}>
              {offFlags.map((f) => f.def.label).join(', ')} —{' '}
              <Link href="/console/system/settings" className="font-semibold underline underline-offset-2">
                런타임 설정에서 확인
              </Link>
            </Callout>
          )}
        </div>
      )}

      {/* ② 처리 대기 큐 */}
      {queue.length > 0 && (
        <section
          className={`mt-5 overflow-hidden rounded-[var(--radius-panel)] border ${
            queueTotal > 0 ? 'border-rose-300 bg-rose-50/60' : 'border-hairline bg-surface'
          }`}
          aria-label="처리 대기 작업"
        >
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <p className={`text-sm font-bold ${queueTotal > 0 ? 'text-rose-700' : 'text-fg'}`}>
              {queueTotal > 0 ? `처리 대기 ${queueTotal}건` : '처리 대기 없음'}
            </p>
            <p className="text-xs text-fg-muted">
              {queueTotal > 0 ? '지금 확인이 필요한 항목입니다.' : '모든 운영 큐가 비어 있습니다.'}
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-hairline border-t border-hairline sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
            {queue.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="bg-surface/70 px-4 py-3 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
              >
                <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">{q.label}</p>
                <p className={`mt-0.5 font-display text-2xl font-bold ${q.count > 0 ? 'text-rose-600' : 'text-fg-quiet'}`}>
                  {q.count}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ③ KPI */}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((c) => (
          <div key={c.label} className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] tracking-wider text-fg-muted">{c.label}</p>
              <DeltaBadge delta={c.delta} />
            </div>
            <p className="mt-1.5 text-3xl font-bold text-fg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              {c.value}
            </p>
            <p className="mt-1 text-xs text-fg-secondary">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ④ 추세 + 운영 활동 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-fg">사용자 트래픽 · 최근 {DAYS}일</h3>
            <span className="font-mono text-[10px] text-brand-600">일별 활동</span>
          </div>
          <AreaChart series={traffic} labels={labels} />
        </div>

        <section className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface" aria-labelledby="feed-title">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
            <h3 id="feed-title" className="text-sm font-bold text-fg">최근 운영 활동</h3>
            {recentAudit.length > 0 && (
              <Link href="/console/access/audit" className="font-mono text-[11px] text-brand-600 hover:underline">
                전체 →
              </Link>
            )}
          </div>
          {recentAudit.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">
              {has('audit.read') ? '아직 기록된 운영 활동이 없습니다.' : '감사 로그 열람 권한이 없습니다.'}
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {recentAudit.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href="/console/access/audit"
                    className="flex items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-brand-50/40"
                  >
                    <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 font-mono text-[9px] font-bold text-fg-muted">
                      {auditActionLabel(entry.action)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-fg">{entry.summary}</span>
                    <SlaBadge since={entry.createdAt} done />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
