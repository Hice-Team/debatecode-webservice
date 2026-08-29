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

// 문의 처리 큐 — 담당자·분류·SLA가 붙은 트리아지 화면.
export default async function InquiryManagementPage() {
  const user = await getUser();
  if (!(await can(user, 'inquiry.respond'))) redirect('/console');

  const [rows, responderRows] = await Promise.all([
    prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    prisma.user.findMany({
      where: { role: { in: ['admin', 'reviewer'] } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  // 답변자 이름 — 이름만 붙이면 되므로 필요한 ID만 모아 한 번에 조회한다
  const answeredByIds = [...new Set(rows.map((q) => q.answeredById).filter((id): id is string => Boolean(id)))];
  const answerers = answeredByIds.length
    ? await prisma.user.findMany({ where: { id: { in: answeredByIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(answerers.map((a) => [a.id, maskName(a.name)]));

  const responders: Responder[] = responderRows.map((r) => ({ id: r.id, name: maskName(r.name) }));
  const responderNameById = new Map(responders.map((r) => [r.id, r.name]));

  const items: InquiryItem[] = rows.map((q) => ({
    id: q.id,
    subject: q.subject,
    body: q.body,
    contact: maskEmail(q.email),
    canEmail: Boolean(q.email),
    status: (q.status === 'answered' ? 'answered' : q.status === 'closed' ? 'closed' : 'open') as InquiryItem['status'],
    category: q.category,
    priority: q.priority ?? 'normal',
    assigneeId: q.assigneeId,
    assigneeName: q.assigneeId ? (responderNameById.get(q.assigneeId) ?? null) : null,
    answer: q.answer,
    answeredByName: q.answeredById ? (nameById.get(q.answeredById) ?? null) : null,
    createdAt: q.createdAt.toISOString(),
    firstResponseAt: q.firstResponseAt ? q.firstResponseAt.toISOString() : null,
  }));

  const now = new Date().getTime();
  const open = items.filter((q) => q.status === 'open');
  const stale = open.filter((q) => now - new Date(q.createdAt).getTime() > 24 * 3600_000).length;
  const unassigned = open.filter((q) => !q.assigneeId).length;

  // 첫 응답까지 걸린 평균 시간 — 응대가 실제로 빨라지고 있는지 보는 유일한 숫자
  const responded = items.filter((q) => q.firstResponseAt);
  const avgHours = responded.length
    ? Math.round(
        responded.reduce(
          (sum, q) => sum + (new Date(q.firstResponseAt!).getTime() - new Date(q.createdAt).getTime()),
          0,
        ) /
          responded.length /
          3600_000,
      )
    : null;

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
            { label: '미답변', value: open.length, warn: open.length > 0 },
            { label: '24시간 초과', value: stale, warn: stale > 0 },
            { label: '담당자 미지정', value: unassigned },
            { label: '평균 첫 응답', value: avgHours != null ? `${avgHours}시간` : '—' },
          ]}
        />
      </div>

      <InquiryWorkspace items={items} responders={responders} currentUserId={user.id} />
    </div>
  );
}
