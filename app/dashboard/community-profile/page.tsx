import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { boardLabel } from '@/app/community/boards';
import { formatPrice, LISTING_STATUS_META, type ListingStatus } from '@/app/lib/market';

export const metadata: Metadata = { title: '내 글과 답글' };

// 커뮤니티 프로필 — 내가 쓴 글, 단 답글, 올린 매물, 남긴 문의를 한 화면에서 본다.
//
// 예전에는 내가 쓴 글을 찾으려면 게시판을 열어 목록을 훑어야 했다. 커뮤니티는 글이
// 쌓일수록 자기 흔적을 되찾기 어려워지는 자리라, 되찾는 화면이 따로 있어야 한다.
const LIMIT = 20;

async function load(userId: string) {
  const [posts, comments, listings, inquiries] = await Promise.all([
    prisma.post.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      select: {
        id: true,
        board: true,
        title: true,
        createdAt: true,
        viewCount: true,
        secret: true,
        anonymous: true,
        _count: { select: { comments: true, likes: true } },
      },
    }),
    prisma.comment.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      select: {
        id: true,
        content: true,
        createdAt: true,
        post: { select: { id: true, title: true, board: true, adoptedCommentId: true } },
      },
    }),
    prisma.marketListing.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      select: {
        id: true,
        price: true,
        status: true,
        postId: true,
        post: { select: { title: true } },
        _count: { select: { chats: true } },
      },
    }),
    prisma.post.findMany({
      where: { authorId: userId, board: 'qna' },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      select: { id: true, title: true, createdAt: true, bounty: true, adoptedCommentId: true },
    }),
  ]);
  return { posts, comments, listings, inquiries };
}

const CARD = 'overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface';
const ROW = 'block px-4 py-3 transition-colors hover:bg-paper';

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-10 text-center text-sm text-fg-muted">{text}</p>;
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-lg font-bold text-fg">{title}</h2>
      <span className="dc-num font-mono text-[12px] text-fg-muted">{count}</span>
    </div>
  );
}

export default async function CommunityProfilePage() {
  const user = await getUser();
  const { posts, comments, listings, inquiries } = await load(user.id);

  return (
    <PageShell width="4xl">
      <BackButton label="대시보드로 돌아가기" className="mb-4" />
      <PageHeader
        slug="community-profile"
        title="내 글과 답글"
        desc="커뮤니티에 남긴 글·답글·매물·문의를 한곳에서 확인합니다."
        className="mb-6"
      />

      <section className="mb-8">
        <SectionTitle title="내가 쓴 글" count={posts.length} />
        <div className={CARD}>
          {posts.length === 0 ? (
            <Empty text="아직 쓴 글이 없습니다." />
          ) : (
            <ul className="divide-y divide-hairline">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link href={`/community/${post.id}`} className={ROW}>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[11px] text-fg-quiet">
                        {boardLabel(post.board)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{post.title}</span>
                      {post.secret && <span className="shrink-0 text-[11px]" title="비밀글">🔒</span>}
                      {post.anonymous && (
                        <span className="shrink-0 font-mono text-[10px] text-fg-quiet">익명</span>
                      )}
                    </div>
                    <p className="dc-num mt-1 font-mono text-[11px] text-fg-quiet">
                      댓글 {post._count.comments} · 좋아요 {post._count.likes} · 조회 {post.viewCount} ·{' '}
                      {post.createdAt.toLocaleDateString('ko-KR')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-8">
        <SectionTitle title="내가 단 답글" count={comments.length} />
        <div className={CARD}>
          {comments.length === 0 ? (
            <Empty text="아직 단 답글이 없습니다." />
          ) : (
            <ul className="divide-y divide-hairline">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <Link href={`/community/${comment.post.id}`} className={ROW}>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[11px] text-fg-quiet">
                        {boardLabel(comment.post.board)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">
                        {comment.post.title}
                      </span>
                      {comment.post.adoptedCommentId === comment.id && (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                          채택됨
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-fg-secondary">{comment.content}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-8">
        <SectionTitle title="내가 올린 매물" count={listings.length} />
        <div className={CARD}>
          {listings.length === 0 ? (
            <Empty text="아직 올린 매물이 없습니다." />
          ) : (
            <ul className="divide-y divide-hairline">
              {listings.map((listing) => {
                const status = LISTING_STATUS_META[listing.status as ListingStatus];
                return (
                  <li key={listing.id}>
                    <Link href={`/community/${listing.postId}`} className={ROW}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                          {listing.post.title}
                        </span>
                        {status && (
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${status.tone}`}
                          >
                            {status.label}
                          </span>
                        )}
                      </div>
                      <p className="dc-num mt-1 font-mono text-[11px] text-fg-quiet">
                        {formatPrice(listing.price)} · 대화 {listing._count.chats}건
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {listings.length > 0 && (
          <p className="mt-2 text-[12px] text-fg-muted">
            거래 대화는{' '}
            <Link href="/dashboard/market" className="font-semibold text-signal hover:underline">
              중고 거래
            </Link>
            에서 관리합니다.
          </p>
        )}
      </section>

      <section>
        <SectionTitle title="내가 남긴 문의" count={inquiries.length} />
        <div className={CARD}>
          {inquiries.length === 0 ? (
            <Empty text="아직 남긴 문의가 없습니다." />
          ) : (
            <ul className="divide-y divide-hairline">
              {inquiries.map((inquiry) => (
                <li key={inquiry.id}>
                  <Link href={`/community/${inquiry.id}`} className={ROW}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                        {inquiry.title}
                      </span>
                      {inquiry.adoptedCommentId ? (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                          채택 완료
                        </span>
                      ) : (
                        inquiry.bounty && (
                          <span className="dc-num shrink-0 rounded-full border border-hairline bg-paper px-2 py-0.5 font-mono text-[10px] text-fg-muted">
                            {inquiry.bounty}P
                          </span>
                        )
                      )}
                    </div>
                    <p className="dc-num mt-1 font-mono text-[11px] text-fg-quiet">
                      {inquiry.createdAt.toLocaleDateString('ko-KR')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PageShell>
  );
}
