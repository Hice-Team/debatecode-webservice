import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import UploadForm from './upload-form';
import BulkImport from './bulk-import';
import { PageHeader, LinkTabs, StatGrid, Callout, EmptyRow } from '../ui';

export const metadata: Metadata = { title: '문제 관리' };

const BANK_LIMIT = 200;

// 문제 관리 — 등록(단건/일괄)과 문제 은행(수정·삭제).
//
// 등록은 검토 권한자만, 문제 은행 관리는 problem.manage를 가진 사람이면 된다.
// 디베이트메이트도 자기가 만든 문제의 오탈자나 잘못된 테스트케이스를 직접 고칠 수 있어야
// 콘텐츠가 굴러간다 — 매번 운영진을 거치면 그 자체가 병목이 된다.
export default async function ProblemUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const user = await getUser();
  const [canReview, canManage] = await Promise.all([
    can(user, 'problem.review'),
    can(user, 'problem.manage'),
  ]);
  if (!canReview && !canManage) redirect('/console');

  const { tab, q } = await searchParams;
  const requested = tab === 'bulk' ? 'bulk' : tab === 'bank' ? 'bank' : 'single';
  // 등록 권한이 없으면(메이트) 문제 은행 탭만 의미가 있다
  const active = !canReview && requested !== 'bank' ? 'bank' : requested;
  const search = (q ?? '').trim();

  const [totalProblems, noCaseCount, recent, pendingDrafts, bankRows] = await Promise.all([
    prisma.problem.count(),
    // 테스트케이스가 없는 문제 — 열어도 채점이 되지 않는다. 있으면 즉시 알려야 한다.
    prisma.problem.count({ where: { testCases: { none: {} } } }),
    prisma.problem.findMany({
      orderBy: { id: 'desc' },
      take: 6,
      select: { id: true, title: true, category: true, difficulty: true, _count: { select: { testCases: true } } },
    }),
    canReview ? prisma.problemDraft.count({ where: { status: 'pending' } }) : Promise.resolve(0),
    active === 'bank'
      ? prisma.problem.findMany({
          where: search
            ? {
                OR: [
                  { title: { contains: search, mode: 'insensitive' } },
                  { category: { contains: search, mode: 'insensitive' } },
                  { company: { contains: search, mode: 'insensitive' } },
                ],
              }
            : undefined,
          orderBy: { id: 'desc' },
          take: BANK_LIMIT,
          select: {
            id: true,
            title: true,
            category: true,
            difficulty: true,
            company: true,
            _count: { select: { testCases: true, submissions: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="PROBLEM MANAGEMENT"
        title="문제 관리"
        sub="테스트케이스까지 갖춘 완전한 형태로 등록하고, 게시된 문제를 고치거나 내립니다."
      />

      {noCaseCount > 0 && (
        <div className="mb-5">
          <Callout tone="danger" title={`테스트케이스가 없는 문제 ${noCaseCount}개`}>
            채점이 성립하지 않는 문제입니다. 이용자가 열면 제출해도 아무 판정이 나오지 않습니다.{' '}
            <Link href="/console/problems?tab=bank" className="font-semibold underline underline-offset-2">
              문제 은행에서 확인
            </Link>
          </Callout>
        </div>
      )}

      <div className="mb-5">
        <StatGrid
          stats={[
            { label: '전체 문제', value: totalProblems },
            { label: '케이스 없음', value: noCaseCount, warn: noCaseCount > 0 },
            { label: '검토 대기 초안', value: pendingDrafts, warn: pendingDrafts > 0 },
            { label: '최근 등록', value: recent.length ? `#${recent[0].id}` : '—' },
          ]}
        />
      </div>

      <LinkTabs
        items={[
          ...(canReview
            ? [
                { href: '/console/problems?tab=single', label: '단건 등록', active: active === 'single' },
                { href: '/console/problems?tab=bulk', label: 'JSON 일괄 등록', active: active === 'bulk' },
              ]
            : []),
          { href: '/console/problems?tab=bank', label: `문제 은행 (${totalProblems})`, active: active === 'bank' },
        ]}
      />

      {active === 'single' && <UploadForm />}
      {active === 'bulk' && <BulkImport />}

      {active === 'bank' && (
        <div>
          {/* 검색은 GET 폼 — 결과 주소를 그대로 공유할 수 있다 */}
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
            <input type="hidden" name="tab" value="bank" />
            <input
              name="q"
              defaultValue={search}
              placeholder="제목·카테고리·기업으로 검색"
              aria-label="문제 검색"
              className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm sm:max-w-xs"
            />
            <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
              검색
            </button>
            {search && (
              <Link
                href="/console/problems?tab=bank"
                className="rounded-xl border border-ink/15 px-3 py-2 text-xs text-fg-secondary"
              >
                초기화
              </Link>
            )}
          </form>

          <div className="divide-y divide-ink/5 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
            {bankRows.length === 0 && (
              <EmptyRow text={search ? '검색 결과가 없습니다.' : '등록된 문제가 없습니다.'} />
            )}
            {bankRows.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="shrink-0 font-mono text-[11px] text-fg-quiet">#{p.id}</span>
                <Link
                  href={`/problems/${p.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-ink hover:text-signal"
                >
                  {p.title}
                </Link>
                <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                  {p.category} · 난이도 {p.difficulty}
                  {p.company ? ` · ${p.company}` : ''}
                </span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    p._count.testCases === 0
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-hairline bg-paper text-fg-muted'
                  }`}
                >
                  케이스 {p._count.testCases}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-fg-quiet">제출 {p._count.submissions}</span>
                <Link
                  href={`/console/problems/${p.id}`}
                  className="shrink-0 rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg hover:border-ink/40"
                >
                  수정·삭제
                </Link>
              </div>
            ))}
          </div>

          {bankRows.length >= BANK_LIMIT && (
            <p className="mt-2 font-mono text-[11px] text-fg-muted">
              최근 {BANK_LIMIT}개까지 표시합니다. 검색으로 좁혀 보세요.
            </p>
          )}
        </div>
      )}

      {/* 최근 등록 — 방금 올린 것이 실제로 들어갔는지 확인하는 자리 */}
      {active !== 'bank' && (
        <div className="mt-10">
          <h3 className="mb-3 text-lg font-bold text-ink">최근 등록된 문제</h3>
          <div className="divide-y divide-ink/5 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
            {recent.length === 0 && <EmptyRow text="등록된 문제가 없습니다." />}
            {recent.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="shrink-0 font-mono text-[11px] text-fg-quiet">#{p.id}</span>
                <Link
                  href={`/problems/${p.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-ink hover:text-signal"
                >
                  {p.title}
                </Link>
                <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                  {p.category} · 난이도 {p.difficulty}
                </span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    p._count.testCases === 0
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-hairline bg-paper text-fg-muted'
                  }`}
                >
                  케이스 {p._count.testCases}
                </span>
                <Link
                  href={`/console/problems/${p.id}`}
                  className="shrink-0 font-mono text-[11px] text-brand-600 hover:underline"
                >
                  수정
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
