import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canManagePublishedContent } from '@/app/lib/roles';
import { redirect } from 'next/navigation';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
import { SET_KIND_BADGE, SET_KIND_LABELS, isSetKind } from '@/app/lib/problem-sets';
import {
  autoBuildExamSets,
  deleteProblemSet,
  toggleProblemSetPublished,
} from '@/app/lib/actions/problem-sets';
import { PageHeader, BTN_NEUTRAL, BTN_PRIMARY, EmptyRow } from '../ui';
import ProblemSetForm from './problem-set-form';
import SetItemsEditor from './set-items-editor';

export const metadata: Metadata = { title: '문제집 세트' };

export default async function ConsoleProblemSetsPage({ searchParams }: PageProps<'/console/problem-sets'>) {
  const user = await getUser();
  if (!canManagePublishedContent(user.role)) redirect('/console');

  const { edit } = await searchParams;
  const editId = Number(typeof edit === 'string' ? edit : '');

  const [sets, editing, problems] = await Promise.all([
    prisma.problemSet.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: { _count: { select: { items: true } } },
    }),
    Number.isInteger(editId)
      ? prisma.problemSet.findUnique({
          where: { id: editId },
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: { problem: { select: { id: true, title: true, difficulty: true, category: true } } },
            },
          },
        })
      : null,
    prisma.problem.findMany({
      orderBy: [{ difficulty: 'asc' }, { title: 'asc' }],
      select: { id: true, title: true, difficulty: true, category: true, company: true },
    }),
  ]);

  const publishedCount = sets.filter((s) => s.published).length;
  const emptyCount = sets.filter((s) => s._count.items === 0).length;

  return (
    <>
      <PageHeader
        eyebrow="Problem Sets"
        title="문제집 세트"
        sub="기출 모음집·실전 모의고사·테마 문제집을 편성하고 코딩테스트 라이브러리에 공개합니다."
      />

      {/* 요약 지표 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '전체 세트', value: sets.length },
          { label: '공개 중', value: publishedCount },
          { label: '비공개', value: sets.length - publishedCount },
          { label: '문제 미편성', value: emptyCount, warn: emptyCount > 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-hairline bg-white px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{stat.label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${stat.warn ? 'text-rose-600' : 'text-ink'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* 자동 편성 */}
      <form
        action={async () => {
          'use server';
          await autoBuildExamSets();
        }}
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-5 py-4"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">기존 기출 문제로 세트 자동 편성</p>
          <p className="mt-0.5 text-xs text-fg-secondary">
            Problem의 기업·연도 정보를 묶어 기출 모음집을 만듭니다. 이미 있는 세트는 건너뜁니다.
          </p>
        </div>
        <button type="submit" className={`${BTN_PRIMARY} ml-auto shrink-0`}>
          자동 편성 실행
        </button>
      </form>

      {/* 편성 중인 세트 — 문제 추가/순서 변경 */}
      {editing && (
        <section className="mb-8 overflow-hidden rounded-[var(--radius-panel)] border border-signal/30 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-brand-50/50 px-5 py-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-brand-600">Editing</p>
              <h3 className="truncate font-bold text-ink">{editing.title}</h3>
            </div>
            <Link href="/console/problem-sets" className={`${BTN_NEUTRAL} ml-auto shrink-0`}>
              편집 닫기
            </Link>
          </div>

          <div className="border-b border-hairline p-5">
            <ProblemSetForm mode="edit" set={editing} />
          </div>

          <SetItemsEditor setId={editing.id} items={editing.items} problems={problems} />
        </section>
      )}

      {/* 새 세트 만들기 */}
      {!editing && (
        <section className="mb-8 rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
          <h3 className="mb-4 font-bold text-ink">새 세트 만들기</h3>
          <ProblemSetForm mode="create" />
        </section>
      )}

      {/* 세트 목록 */}
      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
        <div className="border-b border-hairline px-5 py-3">
          <h3 className="font-bold text-ink">편성된 세트</h3>
        </div>
        {sets.length === 0 ? (
          <EmptyRow text="아직 만든 세트가 없습니다. 위에서 새 세트를 만들거나 자동 편성을 실행해 보세요." />
        ) : (
          <div className="divide-y divide-ink/5">
            {sets.map((set) => {
              const kindKey = isSetKind(set.kind) ? set.kind : 'exam';
              return (
                <div key={set.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SET_KIND_BADGE[kindKey]}`}>
                    {SET_KIND_LABELS[kindKey]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{set.title}</p>
                    <p className="truncate font-mono text-[11px] text-fg-quiet">
                      /{set.slug} · {set._count.items}문제 · {DIFFICULTY_LABELS[set.difficulty] ?? '—'}
                      {set.company ? ` · ${set.company}` : ''}
                      {set.examYear ? ` · ${set.examYear}` : ''}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      set.published ? 'bg-emerald-50 text-emerald-700' : 'bg-ink/5 text-fg-muted'
                    }`}
                  >
                    {set.published ? '공개' : '비공개'}
                  </span>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/console/problem-sets?edit=${set.id}`} className={BTN_NEUTRAL}>
                      편성
                    </Link>
                    <form
                      action={async (formData: FormData) => {
                        'use server';
                        await toggleProblemSetPublished(formData);
                      }}
                    >
                      <input type="hidden" name="id" value={set.id} />
                      <button type="submit" className={BTN_NEUTRAL}>
                        {set.published ? '비공개로' : '공개'}
                      </button>
                    </form>
                    <form
                      action={async (formData: FormData) => {
                        'use server';
                        await deleteProblemSet(formData);
                      }}
                    >
                      <input type="hidden" name="id" value={set.id} />
                      <button
                        type="submit"
                        className="rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-rose-600 hover:border-rose-300"
                      >
                        삭제
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
