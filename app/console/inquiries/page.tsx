import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { maskEmail, maskName } from '@/app/lib/privacy';
import { isEmailLive } from '@/app/lib/email';
import InquiryWorkspace, { type InquiryItem, type Responder } from './inquiry-workspace';
import { PageHeader, StatGrid, Callout } from '../ui';

export const metadata: Metadata = { title: '문의 처리' };

const DAY_MS = 24 * 3600_000;

// 문의 처리 큐 — 담당자·분류·SLA가 붙은 트리아지 화면.
//
// 두 가지를 고쳤다.
//
// 하나, 예전에는 최근 300건만 가져와서 그 안에서 지표를 계산했다. 문의가 300건을
// 넘는 순간 "미답변"은 전체가 아니라 그 창 안의 수가 되고, 창 밖으로 밀려난 오래된
// 미답변은 큐에서 아예 사라진다 — 가장 오래 기다린 사람이 먼저 보이지 않게 된다.
// 처리 중인 문의(미답변·답변됨)는 상한 없이 전부 가져오고, 지표는 목록 길이가 아니라
// DB에서 센다.
//
// 둘, 답변할 때 화면에 있는 것은 제목과 본문뿐이었다. 정작 필요한 것은 "이 사람이
// 전에도 물어봤는가"다 — 같은 사람이 같은 것을 세 번째 묻고 있는지, 다른 담당자가
// 이미 답한 문의가 열려 있는지 모르면 중복 응대가 난다.
export default async function InquiryManagementPage() {
  const user = await getUser();
  if (!(await can(user, 'inquiry.respond'))) redirect('/console');

  const nowMs = new Date().getTime();
  const dayAgo = new Date(nowMs - DAY_MS);

  const [live, archived, responderRows, openCount, staleCount, unassignedCount, slaRows] =
    await Promise.all([
      // 처리 중인 것은 상한을 두지 않는다 — 밀린 것을 감추면 큐가 아니다
      prisma.inquiry.findMany({
        where: { status: { in: ['open', 'answered'] } },
        orderBy: { createdAt: 'desc' },
      }),
      // 보관함은 참고용이라 최근 것만
      prisma.inquiry.findMany({
        where: { status: 'closed' },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.user.findMany({
        where: { role: { in: ['admin', 'reviewer'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.inquiry.count({ where: { status: 'open' } }),
      prisma.inquiry.count({ where: { status: 'open', createdAt: { lt: dayAgo } } }),
      prisma.inquiry.count({ where: { status: 'open', assigneeId: null } }),
      // 최근 30일 첫 응답 평균 — 응대가 실제로 빨라지고 있는지 보는 유일한 숫자.
      // 전체 평균은 옛날 기록에 눌려 지금 상태를 말해 주지 못한다.
      prisma.$queryRaw<{ hours: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt"))) / 3600 AS hours
        FROM "Inquiry"
        WHERE "firstResponseAt" IS NOT NULL
          AND "createdAt" >= NOW() - INTERVAL '30 days'
      `,
    ]);

  const rows = [...live, ...archived];

  /* ---------- 문의자 맥락 ----------
   * 회원이면 userId, 비회원이면 이메일로 같은 사람을 묶는다.
   * 문의마다 따로 조회하면 N+1이 되므로 한 번에 세어 Map으로 붙인다. */
  const userIds = [...new Set(rows.map((q) => q.userId).filter((v): v is string => Boolean(v)))];
  const guestEmails = [
    ...new Set(rows.filter((q) => !q.userId && q.email).map((q) => q.email as string)),
  ];

  const [byUser, byGuest, members, answerers] = await Promise.all([
    userIds.length
      ? prisma.inquiry.groupBy({
          by: ['userId', 'status'],
          where: { userId: { in: userIds } },
          _count: { _all: true },
        })
      : [],
    guestEmails.length
      ? prisma.inquiry.groupBy({
          by: ['email', 'status'],
          where: { email: { in: guestEmails }, userId: null },
          _count: { _all: true },
        })
      : [],
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            createdAt: true,
            role: true,
            sanctions: { select: { active: true, expiresAt: true } },
          },
        })
      : [],
    // 답변자 이름 — 이름만 붙이면 되므로 필요한 ID만 모아 한 번에 조회한다
    (async () => {
      const ids = [...new Set(rows.map((q) => q.answeredById).filter((v): v is string => Boolean(v)))];
      return ids.length
        ? prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        : [];
    })(),
  ]);

  // identity key = `u:<userId>` 또는 `g:<email>`
  const history = new Map<string, { total: number; open: number }>();
  function bump(key: string, status: string, n: number) {
    const e = history.get(key) ?? { total: 0, open: 0 };
    e.total += n;
    if (status === 'open') e.open += n;
    history.set(key, e);
  }
  for (const r of byUser) bump(`u:${r.userId}`, r.status, r._count._all);
  for (const r of byGuest) bump(`g:${r.email}`, r.status, r._count._all);


  const memberById = new Map(
    members.map((m) => [
      m.id,
      {
        joinedDays: Math.floor((nowMs - m.createdAt.getTime()) / DAY_MS),
        role: m.role,
        // 지금 살아 있는 제재만 — 만료된 것은 이 문의와 무관하다
        sanctioned: m.sanctions.some(
          (s) => s.active && (!s.expiresAt || s.expiresAt.getTime() > nowMs),
        ),
      },
    ]),
  );

  const nameById = new Map(answerers.map((a) => [a.id, maskName(a.name)]));
  const responders: Responder[] = responderRows.map((r) => ({ id: r.id, name: maskName(r.name) }));
  const responderNameById = new Map(responders.map((r) => [r.id, r.name]));

  const items: InquiryItem[] = rows.map((q) => {
    const key = q.userId ? `u:${q.userId}` : q.email ? `g:${q.email}` : null;
    const h = key ? history.get(key) : undefined;
    const member = q.userId ? (memberById.get(q.userId) ?? null) : null;

    return {
      id: q.id,
      subject: q.subject,
      body: q.body,
      contact: maskEmail(q.email),
      canEmail: Boolean(q.email),
      status: (q.status === 'answered'
        ? 'answered'
        : q.status === 'closed'
          ? 'closed'
          : 'open') as InquiryItem['status'],
      category: q.category,
      priority: q.priority ?? 'normal',
      assigneeId: q.assigneeId,
      assigneeName: q.assigneeId ? (responderNameById.get(q.assigneeId) ?? null) : null,
      answer: q.answer,
      answeredByName: q.answeredById ? (nameById.get(q.answeredById) ?? null) : null,
      createdAt: q.createdAt.toISOString(),
      firstResponseAt: q.firstResponseAt ? q.firstResponseAt.toISOString() : null,
      // 계정도 이메일도 없으면 같은 사람을 묶을 방법이 없다.
      // 이때 "첫 문의"라고 쓰면 확인하지 않은 것을 단정하는 것이다 — 모른다고 둔다.
      identified: key !== null,
      // 이 건을 뺀 지난 문의 수 / 이 건을 뺀 다른 미답변 수
      priorCount: Math.max(0, (h?.total ?? 1) - 1),
      otherOpen: Math.max(0, (h?.open ?? 0) - (q.status === 'open' ? 1 : 0)),
      member,
    };
  });

  const avgRaw = slaRows[0]?.hours;
  const avgHours = avgRaw == null ? null : Math.round(Number(avgRaw));

  return (
    <div>
      <PageHeader
        eyebrow="INQUIRY TRIAGE"
        title="문의 처리"
        sub="답변은 저장 후에도 수정할 수 있고, 저장과 동시에 회신 메일이 나갑니다."
      />

      {!isEmailLive() && (
        <div className="mb-5">
          <Callout tone="warn" title="메일 전송 수단이 설정되지 않았습니다">
            답변은 저장되지만 회신 메일은 실제로 발송되지 않습니다(dry-run). 이용자는 답변을 확인할 수 없으므로,
            운영 전에 <code className="rounded bg-surface/60 px-1">SMTP_HOST</code> ·{' '}
            <code className="rounded bg-surface/60 px-1">SMTP_USER</code> ·{' '}
            <code className="rounded bg-surface/60 px-1">SMTP_PASS</code>를 설정하세요.
          </Callout>
        </div>
      )}

      <div className="mb-5">
        <StatGrid
          stats={[
            { label: '미답변', value: openCount, warn: openCount > 0 },
            { label: '24시간 초과', value: staleCount, warn: staleCount > 0 },
            { label: '담당자 미지정', value: unassignedCount, warn: unassignedCount > 0 },
            { label: '30일 평균 첫 응답', value: avgHours != null ? `${avgHours}시간` : '—' },
          ]}
        />
      </div>

      <InquiryWorkspace items={items} responders={responders} currentUserId={user.id} />
    </div>
  );
}
