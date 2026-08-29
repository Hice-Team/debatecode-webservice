import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { maskName } from '@/app/lib/privacy';
import { reviewProblemDraft } from '@/app/lib/actions/admin';
import DraftEditor from './draft-editor';
import { PageHeader, SectionHeader, EmptyState, StatGrid, Callout, SlaBadge, BTN_APPROVE, BTN_REJECT } from '../ui';

export const metadata: Metadata = { title: '문제 검토' };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  approved: { label: '승인·게시됨', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: '반려', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};

interface DraftPayload {
  tags?: string[];
  timeLimitMs?: number;
  starterCodes?: Record<string, string>;
  keywords?: string[];
  testCases?: unknown[];
}

// 문제 검토큐 — 승인/반려에 더해 "수정 후 승인"이 가능하다.
export default async function ProblemReviewPage() {
  const user = await getUser();
  if (!(await can(user, 'problem.review'))) redirect('/console');

  const [pending, processed] = await Promise.all([
    prisma.problemDraft.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' }, // 오래 기다린 것부터
      take: 50,
      include: { author: { select: { name: true } } },
    }),
    prisma.problemDraft.findMany({
      where: { status: { in: ['approved', 'rejected'] } },
      orderBy: { reviewedAt: 'desc' },
      take: 15,
      include: { author: { select: { name: true } } },
    }),
  ]);

  const withMeta = pending.map((d) => {
    const payload = (d.payload ?? {}) as DraftPayload;
    return { draft: d, payload, caseCount: payload.testCases?.length ?? 0 };
  });
  const missingCases = withMeta.filter((d) => d.caseCount === 0).length;
  const now = new Date().getTime();
  const stale = withMeta.filter((d) => now - d.draft.createdAt.getTime() > 7 * 86400_000).length;

  return (
    <div>
      <PageHeader
        eyebrow="PROBLEM REVIEW"
        title="문제 검토"
        sub="승인하면 문제 은행에 바로 게시됩니다. 사소한 문제는 반려 대신 직접 고쳐서 승인하세요."
      />

      {missingCases > 0 && (
        <div className="mb-5">
          <Callout tone="danger" title={`테스트케이스가 없는 초안 ${missingCases}건`}>
            이대로 승인하면 채점이 되지 않는 문제가 게시됩니다. [수정 후 승인하기]로 케이스를 채운 뒤 승인하세요.
          </Callout>
        </div>
      )}

      <div className="mb-5">
        <StatGrid
          stats={[
            { label: '검토 대기', value: pending.length, warn: pending.length > 0 },
            { label: '케이스 미비', value: missingCases, warn: missingCases > 0 },
            { label: '7일 초과 대기', value: stale, warn: stale > 0 },
            { label: '최근 처리', value: processed.length },
          ]}
        />
      </div>

      <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
        {withMeta.length === 0 && (
          <EmptyState
            title="검토 대기 중인 문제가 없습니다"
            sub="출제자가 초안을 제출하면 여기에 나타납니다."
            action={
              <Link href="/console/problems" className="font-mono text-xs text-brand-600 hover:underline">
                직접 문제 업로드하기 →
              </Link>
            }
          />
        )}
        {withMeta.map(({ draft: d, payload, caseCount }) => (
          <details key={d.id} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg">
                  <span className="mr-1.5 font-mono text-[10px] text-brand-600 group-open:hidden">▶</span>
                  <span className="mr-1.5 hidden font-mono text-[10px] text-brand-600 group-open:inline">▼</span>
                  {d.title}
                </p>
                <p className="font-mono text-[11px] text-fg-muted">
                  {maskName(d.author.name)} · 난이도 {d.difficulty} · {d.category} ·{' '}
                  {d.createdAt.toLocaleDateString('ko-KR')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    caseCount === 0
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  케이스 {caseCount}
                </span>
                <SlaBadge since={d.createdAt} />
              </div>
            </summary>

            <div className="mt-3 rounded-xl border border-hairline bg-paper/40 p-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted">문제 설명</p>
              <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-fg">
                {d.description}
              </p>

              <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] text-fg-muted">
                <span>제한 {payload.timeLimitMs ?? 3000}ms</span>
                <span>태그 {payload.tags?.length ?? 0}</span>
                <span>키워드 {payload.keywords?.length ?? 0}</span>
                <span>스타터 {Object.keys(payload.starterCodes ?? {}).length}개 언어</span>
              </div>

              {(() => {
                const cd = d.copyrightDelegation as { donated?: boolean; signerName?: string; agreedAt?: string } | null;
                return cd?.donated ? (
                  <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                    저작권 기증 위임서 제출됨 · 서명 {cd.signerName} ·{' '}
                    {cd.agreedAt ? new Date(cd.agreedAt).toLocaleDateString('ko-KR') : ''}
                  </p>
                ) : (
                  <p className="mt-3 font-mono text-[11px] text-fg-muted">저작권: 창작자 보유 (위임서 미제출)</p>
                );
              })()}
            </div>

            {/* 수정 후 승인 */}
            <div className="mt-3">
              <DraftEditor
                draft={{
                  id: d.id,
                  title: d.title,
                  difficulty: d.difficulty,
                  category: d.category,
                  description: d.description,
                  payload: JSON.stringify(payload, null, 2),
                  caseCount,
                }}
              />
            </div>

            {/* 승인 / 반려 */}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <form action={reviewProblemDraft} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="action" value="reject" />
                <input
                  name="note"
                  placeholder="반려 사유 (선택 — 출제자에게 표시됩니다)"
                  className="w-full flex-1 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs placeholder:text-fg-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                />
                <button className={BTN_REJECT}>반려</button>
              </form>
              <form action={reviewProblemDraft}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="action" value="approve" />
                <button className={BTN_APPROVE}>승인·게시</button>
              </form>
            </div>
          </details>
        ))}
      </div>

      {/* 최근 처리 이력 */}
      <div className="mt-10">
        <SectionHeader title="최근 처리 이력" sub="최근 승인/반려된 초안 15건입니다." />
        <div className="divide-y divide-hairline rounded-[var(--radius-panel)] border border-hairline bg-surface">
          {processed.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-fg-muted">처리한 초안이 아직 없습니다.</p>
          )}
          {processed.map((d) => {
            const st = STATUS_BADGE[d.status] ?? STATUS_BADGE.rejected;
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${st.cls}`}>
                  {st.label}
                </span>
                <span className="truncate font-medium text-fg">{d.title}</span>
                <span className="font-mono text-[11px] text-fg-muted">
                  {maskName(d.author.name)} · {d.category}
                </span>
                {d.reviewNote && <span className="truncate text-xs text-fg-muted">— {d.reviewNote}</span>}
                <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-muted">
                  {d.reviewedAt?.toLocaleDateString('ko-KR')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
