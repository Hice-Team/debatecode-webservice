import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import { prisma } from '@/app/lib/prisma';
import { verifySession } from '@/app/lib/dal';
import { createWorkbook, removeWorkbookItem } from '@/app/lib/actions/bookmarks';
import { DIFFICULTY_LABELS } from '@/app/lib/types';

export const metadata: Metadata = { title: '내 문제집' };

const DIFFICULTY_BADGE: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  2: 'bg-sky-100 text-sky-700 border-sky-200',
  3: 'bg-amber-100 text-amber-700 border-amber-200',
  4: 'bg-rose-100 text-rose-700 border-rose-200',
};

export default async function MyProblemsPage() {
  const { userId } = await verifySession();

  await prisma.workbook.upsert({ where: { userId_name: { userId, name: '기본 문제집' } }, create: { userId, name: '기본 문제집', isDefault: true }, update: {} });
  const workbooks = await prisma.workbook.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], include: { items: { orderBy: { createdAt: 'desc' }, include: { problem: { select: { id: true, title: true, difficulty: true, category: true, company: true } } } } } });
  const itemCount = workbooks.reduce((total, book) => total + book.items.length, 0);

  return (
    <PageShell width="4xl">
        <PageHeader
          slug="my-scrapbook"
          title="나만의 문제집"
          desc={
            <>
              스크랩한 문제 {itemCount}개.{' '}
              <Link href="/problems" className="text-brand-600 underline underline-offset-2">
                문제집 전체 보기
              </Link>
            </>
          }
        />

        <form action={async (formData) => { 'use server'; await createWorkbook(String(formData.get('name') ?? '')); }} className="mb-4 flex gap-2"><input name="name" required maxLength={40} placeholder="새 커스텀 문제집 이름" className="rounded-lg border border-hairline px-3 py-2 text-sm"/><button className="rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-white">문제집 만들기</button></form>
        <div className="space-y-4">
          {workbooks.map((book) => <section key={book.id} className="overflow-hidden rounded-xl border border-hairline bg-surface"><div className="flex items-center justify-between border-b border-hairline px-5 py-3"><h2 className="font-semibold">{book.name}</h2><span className="text-xs text-fg-muted">{book.isDefault ? '기본 문제집 · ' : ''}{book.items.length}문제</span></div><div className="divide-y divide-hairline">{book.items.map((item) => <div key={item.id} className="flex items-center gap-4 px-5 py-3"><span className="text-signal"><svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M6 3.75A2.25 2.25 0 0 1 8.25 1.5h7.5A2.25 2.25 0 0 1 18 3.75v18l-6-3.75-6 3.75v-18Z" /></svg></span><Link href={`/problems/${item.problem.id}`} className="font-semibold hover:text-brand-600">{item.problem.title}</Link><span className="font-mono text-xs text-fg-muted">{item.problem.category}</span><span className={`ml-auto px-2 py-0.5 rounded-full border text-[11px] font-medium ${DIFFICULTY_BADGE[item.problem.difficulty]}`}>{DIFFICULTY_LABELS[item.problem.difficulty]}</span><form action={async () => { 'use server'; await removeWorkbookItem(item.id); }}><button className="text-xs text-rose-500">제거</button></form></div>)}{book.items.length === 0 && <p className="px-5 py-7 text-center text-sm text-fg-quiet">아직 저장된 문제가 없습니다.</p>}</div></section>)}
          {workbooks.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-fg-quiet">
              아직 스크랩한 문제가 없습니다. 문제집에서 ☆ 아이콘을 눌러 담아보세요.
            </div>
          )}
        </div>
    </PageShell>
  );
}
