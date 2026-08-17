import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { roleLabel, canReview, canManagePublishedContent } from '@/app/lib/roles';
import { AreaChart } from '@/app/components/charts';

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

// 콘솔 개요 — 처리 대기 큐, KPI, 최근 14일 트래픽, 운영 활동 피드, 관리 도구 바로가기
export default async function ConsoleOverviewPage() {
  const user = await getUser();
  const isAdmin = user.role === 'admin';
  const reviewer = canReview(user.role);
  const showContent = isAdmin || user.role === 'problem_setter';

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
    totalProblems,
    codingTestProblems,
    totalCourses,
    totalLessons,
    debateQSessions,
    activeAnnouncements,
    publishedSets,
    totalSets,
    todaySignups,
    todaySubmissions,
    recentUsers,
    recentReports,
    recentInquiries,
    recentDrafts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.submission.count(),
    prisma.post.count(),
    prisma.interviewSession.count({ where: { status: 'COMPLETED' } }),
    prisma.interviewSession.aggregate({ _avg: { defenseScore: true }, where: { status: 'COMPLETED' } }),
    prisma.user.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.submission.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.post.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    prisma.report.count({ where: { status: 'pending' } }),
    prisma.inquiry.count({ where: { status: 'open' } }),
    prisma.problemDraft.count({ where: { status: 'pending' } }),
    prisma.debateMateApplication.count({ where: { status: 'pending' } }),
    prisma.problem.count(),
    prisma.problem.count({ where: { company: { not: null } } }),
    prisma.course.count(),
    prisma.lesson.count(),
    prisma.debateQSession.count(),
    prisma.announcement.count({ where: { active: true } }),
    prisma.problemSet.count({ where: { published: true } }),
    prisma.problemSet.count(),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.submission.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, name: true, createdAt: true } }),
    reviewer
      ? prisma.report.findMany({ orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, reason: true, targetType: true, status: true, createdAt: true } })
      : Promise.resolve([]),
    reviewer
      ? prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, subject: true, status: true, createdAt: true } })
      : Promise.resolve([]),
    reviewer
      ? prisma.problemDraft.findMany({ orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, title: true, status: true, createdAt: true } })
      : Promise.resolve([]),
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

  // 처리 대기 큐 — 운영자가 지금 손대야 할 항목만 모은다
  const queue = [
    { href: '/console/reports', label: '미처리 신고', count: pendingReports, show: reviewer },
    { href: '/console/inquiries', label: '미답변 문의', count: openInquiries, show: reviewer },
    { href: '/console/problem-review', label: '검토 대기 문제', count: pendingDrafts, show: reviewer },
    { href: '/console/mates', label: '메이트 신청', count: pendingMates, show: reviewer },
  ].filter((q) => q.show);
  const queueTotal = queue.reduce((sum, q) => sum + q.count, 0);

  interface ToolCard { href: string; title: string; desc: string; stat: string; alert?: boolean; show: boolean }
  const toolCards: ToolCard[] = [
    { href: '/dashboard/problems', title: '문제 은행', desc: '문제 추가·수정·삭제', stat: `${totalProblems}문제`, show: showContent },
    { href: '/console/problem-sets', title: '문제집 세트', desc: '기출·모의고사 세트 편성', stat: `공개 ${publishedSets}/${totalSets}`, show: canManagePublishedContent(user.role) },
    { href: '/dashboard/problems?track=coding-test', title: '코딩테스트 문제', desc: '기업 기출·변형 문제', stat: `${codingTestProblems}문제`, show: showContent },
    { href: '/dashboard/study', title: '학습 커리큘럼 · 독스', desc: '코스/강의 · 한국어 문서', stat: `${totalCourses}코스 · ${totalLessons}강`, show: showContent },
    { href: '/dashboard/community', title: '커뮤니티 관리', desc: '글 삭제 · 게시판 운영', stat: `${totalPosts}글`, show: isAdmin || user.role === 'reviewer' },
    { href: '/console/problem-review', title: '문제 검토큐', desc: '메이트 출제 승인/반려', stat: `대기 ${pendingDrafts}건`, alert: pendingDrafts > 0, show: reviewer },
    { href: '/console/mates', title: '메이트 관리', desc: '신청 검토 · 권한 회수', stat: `대기 ${pendingMates}건`, alert: pendingMates > 0, show: reviewer },
    { href: '/console/reports', title: '신고 처리', desc: '게시글·답글·사용자 신고', stat: `미처리 ${pendingReports}건`, alert: pendingReports > 0, show: reviewer },
    { href: '/console/inquiries', title: '문의 처리', desc: '사용자 문의 답변', stat: `미답변 ${openInquiries}건`, alert: openInquiries > 0, show: reviewer },
    { href: '/console/members', title: '회원·권한 관리', desc: '검색 · 역할 · 제재 · debateQ 허용', stat: `${totalUsers}명`, show: isAdmin || user.role === 'reviewer' },
    { href: '/hall-of-fame', title: '명예의 전당', desc: '부문별 랭킹 현황', stat: '바로가기', show: true },
    { href: '/problems', title: 'debateQ 현황', desc: '문제집 debateQ 토글 모드', stat: `세션 ${debateQSessions}건`, show: true },
    { href: '/console/popups', title: '공지 팝업', desc: '전체 공지 게시/관리', stat: `LIVE ${activeAnnouncements}건`, show: isAdmin },
    { href: '/console/drafts', title: '내 문제 초안', desc: '초안 제출 · 검토 현황', stat: '바로가기', show: !isAdmin && ['problem_setter', 'debate_mate'].includes(user.role) },
  ];
  const visibleCards = toolCards.filter((c) => c.show);

  // 운영 활동 피드 — 여러 도메인의 최근 이벤트를 시간순으로 합친다
  const feed = [
    ...recentUsers.map((u) => ({ at: u.createdAt, kind: '가입', text: `${u.name}님이 가입했습니다`, href: '/console/members', tone: 'neutral' as const })),
    ...recentReports.map((r) => ({ at: r.createdAt, kind: '신고', text: `${r.targetType} 신고 (${r.reason})`, href: '/console/reports', tone: r.status === 'pending' ? ('alert' as const) : ('neutral' as const) })),
    ...recentInquiries.map((i) => ({ at: i.createdAt, kind: '문의', text: i.subject, href: '/console/inquiries', tone: i.status === 'open' ? ('alert' as const) : ('neutral' as const) })),
    ...recentDrafts.map((d) => ({ at: d.createdAt, kind: '초안', text: d.title, href: '/console/problem-review', tone: d.status === 'pending' ? ('alert' as const) : ('neutral' as const) })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600">ADMIN CONSOLE</span>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            관리 콘솔
          </h1>
          <p className="mt-1 text-sm text-ink-soft/60">{user.name}님 · {roleLabel(user.role)} 권한으로 접속 중</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
          📅 {now.toLocaleDateString('ko-KR')}
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        </span>
      </div>

      {/* 처리 대기 큐 — 손댈 일이 있을 때만 강조해서 띄운다 */}
      {queue.length > 0 && (
        <section
          className={`mt-6 overflow-hidden rounded-2xl border ${
            queueTotal > 0 ? 'border-rose-300 bg-rose-50/60' : 'border-ink/10 bg-white'
          }`}
          aria-label="처리 대기 작업"
        >
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <p className={`text-sm font-bold ${queueTotal > 0 ? 'text-rose-700' : 'text-ink'}`}>
              {queueTotal > 0 ? `처리 대기 ${queueTotal}건` : '처리 대기 없음'}
            </p>
            <p className="text-xs text-ink-soft/55">
              {queueTotal > 0 ? '지금 확인이 필요한 항목입니다.' : '모든 운영 큐가 비어 있습니다.'}
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-ink/[0.07] border-t border-ink/[0.07] sm:grid-cols-4 sm:divide-y-0">
            {queue.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="bg-white/70 px-4 py-3 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
              >
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft/45">{q.label}</p>
                <p className={`mt-0.5 font-display text-2xl font-bold ${q.count > 0 ? 'text-rose-600' : 'text-ink-soft/35'}`}>
                  {q.count}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* KPI 스트립 */}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((c) => (
          <div key={c.label} className="rounded-2xl border border-ink/10 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] tracking-wider text-ink-soft/55">{c.label}</p>
              <DeltaBadge delta={c.delta} />
            </div>
            <p className="mt-1.5 text-3xl font-bold text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              {c.value}
            </p>
            <p className="mt-1 text-xs text-ink-soft/60">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* 트래픽 + 활동 피드 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-ink/10 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink">사용자 트래픽 · 최근 {DAYS}일</h3>
            <span className="font-mono text-[10px] text-brand-600">일별 활동</span>
          </div>
          <AreaChart series={traffic} labels={labels} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white" aria-labelledby="feed-title">
          <div className="border-b border-ink/[0.07] px-5 py-3">
            <h3 id="feed-title" className="text-sm font-bold text-ink">최근 운영 활동</h3>
          </div>
          {feed.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-soft/45">아직 활동 기록이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-ink/5">
              {feed.map((event, i) => (
                <li key={`${event.kind}-${i}`}>
                  <Link href={event.href} className="flex items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-brand-50/40">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                        event.tone === 'alert' ? 'bg-rose-100 text-rose-700' : 'bg-ink/[0.06] text-ink-soft/50'
                      }`}
                    >
                      {event.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-soft/75">{event.text}</span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-soft/35">
                      {event.at.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 관리 도구 */}
      <div className="mt-8">
        <h3 className="mb-3 text-lg font-bold text-ink">관리 도구</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleCards.map((t) => (
            <Link
              key={t.href + t.title}
              href={t.href}
              className={`group rounded-2xl border p-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                t.alert ? 'border-rose-300 bg-rose-50/50 hover:bg-rose-50' : 'border-ink/10 bg-white hover:border-brand-300 hover:bg-brand-50/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={`font-bold ${t.alert ? 'text-rose-700' : 'text-ink group-hover:text-signal'}`}>{t.title}</p>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${t.alert ? 'border-rose-300 bg-white text-rose-700' : 'border-ink/10 bg-paper text-ink-soft/60'}`}>
                  {t.stat}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft/55">{t.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
