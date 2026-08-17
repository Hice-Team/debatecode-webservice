import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canReview } from '@/app/lib/roles';
import { resolveReport } from '@/app/lib/actions/admin';
import { PageHeader, SectionHeader, EmptyRow, BTN_PRIMARY, BTN_NEUTRAL, REPORT_REASON, TARGET_LABEL } from '../ui';

export const metadata: Metadata = { title: '신고 처리' };

// 신고 처리 큐 — 커뮤니티 게시글·답글·사용자 신고 접수 건 처리
export default async function ReportManagementPage() {
  const user = await getUser();
  if (!canReview(user.role)) redirect('/console');

  const [reports, processed] = await Promise.all([
    prisma.report.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.report.findMany({ where: { status: { in: ['resolved', 'dismissed'] } }, orderBy: { resolvedAt: 'desc' }, take: 15 }),
  ]);

  // 신고 대상 콘텐츠 스냅샷 — 게시글/댓글 본문을 배치로 조회해 상세보기에 첨부
  const postIds = reports.filter((r) => r.targetType === 'post').map((r) => r.targetId);
  const commentIds = reports.filter((r) => r.targetType === 'comment').map((r) => r.targetId);
  const [posts, comments] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true, content: true } })
      : Promise.resolve([]),
    commentIds.length
      ? prisma.comment.findMany({ where: { id: { in: commentIds } }, select: { id: true, content: true, postId: true } })
      : Promise.resolve([]),
  ]);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const commentById = new Map(comments.map((c) => [c.id, c]));

  function target(r: { targetType: string; targetId: string }): { text: string; href?: string; gone?: boolean } {
    if (r.targetType === 'post') {
      const p = postById.get(r.targetId);
      if (!p) return { text: '(삭제되었거나 찾을 수 없는 게시글)', gone: true };
      return { text: `"${p.title}" — ${p.content.slice(0, 200)}`, href: `/community/${p.id}` };
    }
    if (r.targetType === 'comment') {
      const c = commentById.get(r.targetId);
      if (!c) return { text: '(삭제되었거나 찾을 수 없는 댓글)', gone: true };
      return { text: c.content.slice(0, 240), href: `/community/${c.postId}` };
    }
    return { text: `사용자 ${r.targetId.slice(0, 12)}…` };
  }

  return (
    <div>
      <PageHeader eyebrow="REPORT MANAGEMENT" title="신고 처리 큐" sub="커뮤니티 게시글·답글의 신고 버튼으로 접수된 건입니다." />

      <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
        {reports.length === 0 && <EmptyRow text="미처리 신고가 없습니다." />}
        {reports.map((r) => {
          const t = target(r);
          return (
            <div key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="mr-1.5 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] text-rose-700">
                    {REPORT_REASON[r.reason] ?? r.reason}
                  </span>
                  {TARGET_LABEL[r.targetType] ?? r.targetType} 신고
                  <span className="ml-1.5 font-mono text-[11px] text-ink-soft/45">{r.createdAt.toLocaleDateString('ko-KR')}</span>
                </p>
                {r.detail && <p className="mt-1 text-xs text-ink-soft/70">신고 사유: {r.detail}</p>}
                <div className={`mt-2 rounded-xl border p-3 ${t.gone ? 'border-ink/10 bg-paper/40' : 'border-rose-100 bg-rose-50/40'}`}>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-soft/45">신고 대상 내용</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-soft/80">{t.text}</p>
                  {t.href && (
                    <a href={t.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-block font-mono text-[11px] text-brand-600 hover:underline">
                      원문 보기 ↗
                    </a>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:ml-2">
                <form action={resolveReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="action" value="resolve" />
                  <button className={BTN_PRIMARY}>처리완료</button>
                </form>
                <form action={resolveReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="action" value="dismiss" />
                  <button className={BTN_NEUTRAL}>기각</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <SectionHeader title="최근 처리 이력" />
        <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white">
          {processed.length === 0 && <EmptyRow text="처리한 신고가 아직 없습니다." />}
          {processed.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                  r.status === 'resolved'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-ink/10 bg-paper text-ink-soft/55'
                }`}
              >
                {r.status === 'resolved' ? '처리완료' : '기각'}
              </span>
              <span className="text-sm text-ink">
                {REPORT_REASON[r.reason] ?? r.reason} · {TARGET_LABEL[r.targetType] ?? r.targetType}
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-soft/45">{r.resolvedAt?.toLocaleDateString('ko-KR')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
