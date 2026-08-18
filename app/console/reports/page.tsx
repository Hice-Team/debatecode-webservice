import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { maskName } from '@/app/lib/privacy';
import { roleLabel } from '@/app/lib/roles';
import ReportWorkspace, { type ReportCase, type Reviewer } from './report-workspace';
import { PageHeader, StatGrid } from '../ui';

export const metadata: Metadata = { title: '신고 처리' };

const CASE_LIMIT = 200;

// 신고 처리 큐 — 대상별로 묶은 케이스 단위 트리아지.
//
// 여기서 하는 일은 데이터 조립이다. 같은 대상(dedupeKey)에 대한 신고를 하나로 모으고,
// 원문 스냅샷과 작성자 이력을 붙여서 화면이 "판단에 필요한 것"을 한 번에 갖게 한다.
export default async function ReportManagementPage() {
  const user = await getUser();
  if (!(await can(user, 'report.review'))) redirect('/console');

  const [canModerate, canSanction] = await Promise.all([
    can(user, 'community.moderate'),
    can(user, 'sanction.issue'),
  ]);

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: 'desc' },
    take: CASE_LIMIT * 3, // 묶이기 전 기준이라 넉넉히 읽는다
    select: {
      id: true,
      targetType: true,
      targetId: true,
      dedupeKey: true,
      reason: true,
      detail: true,
      status: true,
      priority: true,
      assigneeId: true,
      internalNote: true,
      actionTaken: true,
      createdAt: true,
    },
  });

  // dedupeKey가 없는 과거 데이터도 안전하게 묶는다
  const keyOf = (r: { targetType: string; targetId: string; dedupeKey: string | null }) =>
    r.dedupeKey ?? `${r.targetType}:${r.targetId}`;

  const grouped = new Map<string, typeof reports>();
  for (const r of reports) {
    const key = keyOf(r);
    // 미처리와 처리됨이 한 대상에 섞여 있으면 별개 케이스로 본다 —
    // 지난달 처리한 건과 오늘 새로 들어온 건을 한 덩어리로 묶으면 종결 이력이 뭉개진다
    const bucket = `${key}#${r.status === 'pending' ? 'open' : 'closed'}`;
    const list = grouped.get(bucket) ?? [];
    list.push(r);
    grouped.set(bucket, list);
  }

  // 원문 스냅샷 배치 조회
  const postIds = [...new Set(reports.filter((r) => r.targetType === 'post').map((r) => r.targetId))];
  const commentIds = [...new Set(reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId))];
  const userIds = [...new Set(reports.filter((r) => r.targetType === 'user').map((r) => r.targetId))];

  const [posts, comments, reportedUsers] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, title: true, content: true, authorId: true },
        })
      : Promise.resolve([]),
    commentIds.length
      ? prisma.comment.findMany({
          where: { id: { in: commentIds } },
          select: { id: true, content: true, postId: true, authorId: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const postById = new Map(posts.map((p) => [p.id, p]));
  const commentById = new Map(comments.map((c) => [c.id, c]));
  const liveUserIds = new Set(reportedUsers.map((u) => u.id));

  // 작성자 맥락 — 신고 대상이 누구인지 모으고, 그 계정의 제재·누적 신고를 붙인다
  const authorIds = new Set<string>([
    ...posts.map((p) => p.authorId),
    ...comments.map((c) => c.authorId),
    ...userIds.filter((id) => liveUserIds.has(id)),
  ]);

  const now = new Date().getTime();
  const [authors, reportCountsRaw, reviewerRows] = await Promise.all([
    authorIds.size
      ? prisma.user.findMany({
          where: { id: { in: [...authorIds] } },
          select: {
            id: true,
            name: true,
            role: true,
            createdAt: true,
            sanctions: { select: { active: true, expiresAt: true } },
          },
        })
      : Promise.resolve([]),
    // 이 계정들이 지금까지 받은 신고 수 — 대상 ID 기준으로 센다
    prisma.report.groupBy({ by: ['targetId'], _count: { _all: true } }).catch(() => []),
    // 담당자 후보 — 신고를 처리할 수 있는 역할
    prisma.user.findMany({
      where: { role: { in: ['admin', 'reviewer'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const reportCountByTarget = new Map(reportCountsRaw.map((r) => [r.targetId, r._count._all]));
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const reviewers: Reviewer[] = reviewerRows.map((r) => ({ id: r.id, name: maskName(r.name) }));
  const reviewerNameById = new Map(reviewers.map((r) => [r.id, r.name]));

  const cases: ReportCase[] = [...grouped.values()]
    .map((group) => {
      const head = group[0];
      const key = keyOf(head);
      const sorted = [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // 원문 + 작성자
      let content = { title: null as string | null, body: '', href: null as string | null, gone: true };
      let authorId: string | null = null;

      if (head.targetType === 'post') {
        const p = postById.get(head.targetId);
        if (p) {
          content = { title: p.title, body: p.content.slice(0, 4000), href: `/community/${p.id}`, gone: false };
          authorId = p.authorId;
        }
      } else if (head.targetType === 'comment') {
        const c = commentById.get(head.targetId);
        if (c) {
          content = { title: null, body: c.content.slice(0, 4000), href: `/community/${c.postId}`, gone: false };
          authorId = c.authorId;
        }
      } else if (liveUserIds.has(head.targetId)) {
        content = { title: null, body: '사용자 계정에 대한 신고입니다.', href: null, gone: false };
        authorId = head.targetId;
      }

      const a = authorId ? authorById.get(authorId) : null;
      const live = a?.sanctions.filter((s) => s.active && (!s.expiresAt || s.expiresAt.getTime() > now)) ?? [];

      return {
        dedupeKey: key,
        targetType: head.targetType,
        targetId: head.targetId,
        status: (head.status === 'pending' ? 'pending' : head.status) as ReportCase['status'],
        priority: head.priority ?? 'normal',
        count: group.length,
        firstAt: sorted[0].createdAt.toISOString(),
        lastAt: sorted[sorted.length - 1].createdAt.toISOString(),
        assigneeId: head.assigneeId,
        assigneeName: head.assigneeId ? (reviewerNameById.get(head.assigneeId) ?? null) : null,
        internalNote: head.internalNote,
        actionTaken: head.actionTaken,
        reasons: group.map((r) => ({ reason: r.reason, detail: r.detail })),
        content,
        author: a
          ? {
              id: a.id,
              name: maskName(a.name),
              roleLabel: roleLabel(a.role),
              joinedAt: a.createdAt.toISOString(),
              activeSanctions: live.length,
              pastSanctions: a.sanctions.length - live.length,
              totalReports: reportCountByTarget.get(a.id) ?? group.length,
            }
          : null,
        reportIds: group.map((r) => r.id),
      } satisfies ReportCase;
    })
    .slice(0, CASE_LIMIT);

  const pendingCases = cases.filter((c) => c.status === 'pending');
  const urgentCount = pendingCases.filter((c) => c.priority === 'urgent' || c.priority === 'high').length;
  const staleCount = pendingCases.filter((c) => now - new Date(c.firstAt).getTime() > 72 * 3600_000).length;
  const unassigned = pendingCases.filter((c) => !c.assigneeId).length;

  return (
    <div>
      <PageHeader
        eyebrow="REPORT TRIAGE"
        title="신고 처리"
        sub="같은 대상에 대한 신고는 하나의 케이스로 묶입니다. 삭제·제재·종결을 이 화면에서 끝냅니다."
      />

      <div className="mb-5">
        <StatGrid
          stats={[
            { label: '미처리 케이스', value: pendingCases.length, warn: pendingCases.length > 0 },
            { label: '높음·긴급', value: urgentCount, warn: urgentCount > 0 },
            { label: '72시간 초과', value: staleCount, warn: staleCount > 0 },
            { label: '담당자 미지정', value: unassigned },
          ]}
        />
      </div>

      <ReportWorkspace
        cases={cases}
        reviewers={reviewers}
        currentUserId={user.id}
        canModerate={canModerate}
        canSanction={canSanction}
      />
    </div>
  );
}
