import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { adminDeletePost, suspendUser } from '@/app/lib/actions/admin';
import { boardLabel } from '@/app/community/boards';

export const metadata: Metadata = { title: '커뮤니티 관리' };

export default async function CommunityAdminPage() {
  const user = await getUser();
  if (user.role !== 'admin') redirect('/dashboard');

  const [posts, suspended] = await Promise.all([
    prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        board: true,
        title: true,
        createdAt: true,
        viewCount: true,
        author: { select: { id: true, name: true, suspendedUntil: true } },
        _count: { select: { comments: true, likes: true } },
      },
    }),
    prisma.user.findMany({
      where: { suspendedUntil: { gt: new Date() } },
      select: { id: true, name: true, email: true, suspendedUntil: true },
      orderBy: { suspendedUntil: 'desc' },
    }),
  ]);

  return (
    <PageShell width="4xl">
      <BackButton label="관리자 대시보드로" className="mb-4" />
      <PageHeader
        slug="community-management"
        title="커뮤니티 관리"
        desc="최근 게시글 50건 — 글 삭제와 작성자 제재(글/댓글 작성 제한)를 처리합니다."
        className="mt-4 mb-6"
      />

      {/* 제재 중인 사용자 */}
      {suspended.length > 0 && (
        <section className="mb-8 rounded-xl border border-rose-200 bg-rose-50/60 p-5">
          <h3 className="font-mono text-xs text-rose-600 tracking-wider mb-3">현재 제재 중 ({suspended.length})</h3>
          <ul className="space-y-2">
            {suspended.map((u) => (
              <li key={u.id} className="flex items-center gap-3 text-sm">
                <span className="font-medium">{u.name}</span>
                <span className="font-mono text-[11px] text-fg-quiet">{u.email}</span>
                <span className="ml-auto font-mono text-[11px] text-rose-600">
                  {u.suspendedUntil!.toLocaleString('ko-KR')} 까지
                </span>
                <form action={suspendUser.bind(null, u.id, 0)}>
                  <button type="submit" className="text-xs font-medium text-emerald-600 hover:text-emerald-700 underline underline-offset-2">
                    해제
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="bg-surface rounded-xl border border-hairline divide-y divide-hairline">
        {posts.map((p) => {
          const isSuspended = p.author.suspendedUntil && p.author.suspendedUntil > new Date();
          return (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
              <span className="shrink-0 font-mono text-[10px] text-fg-quiet rounded border border-hairline bg-paper px-1.5 py-0.5">
                {boardLabel(p.board)}
              </span>
              <Link href={`/community/${p.id}`} className="font-medium truncate hover:text-brand-600 transition-colors">
                {p.title}
              </Link>
              <span className={`shrink-0 font-mono text-[11px] ${isSuspended ? 'text-rose-500' : 'text-fg-quiet'}`}>
                {p.author.name}
                {isSuspended && ' (제재중)'}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-quiet hidden md:inline">
                {p.createdAt.toLocaleDateString('ko-KR')} · 댓글 {p._count.comments} · 좋아요 {p._count.likes}
              </span>
              <form action={suspendUser.bind(null, p.author.id, 7)} className="shrink-0">
                <button
                  type="submit"
                  title="작성자를 7일간 글/댓글 작성 제한"
                  className="font-mono text-[11px] text-brand-600/80 hover:text-brand-700 underline underline-offset-2"
                >
                  7일 제재
                </button>
              </form>
              <form action={adminDeletePost} className="shrink-0">
                <input type="hidden" name="postId" value={p.id} />
                <button
                  type="submit"
                  className="font-mono text-[11px] text-rose-500/70 hover:text-rose-600 underline underline-offset-2"
                >
                  글 삭제
                </button>
              </form>
            </div>
          );
        })}
        {posts.length === 0 && (
          <div className="px-6 py-16 text-center text-sm text-fg-quiet">게시글이 없습니다.</div>
        )}
      </div>
    </PageShell>
  );
}
