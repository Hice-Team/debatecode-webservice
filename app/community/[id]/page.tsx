import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageShell } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import { boardLabel, platformColor, platformLabel } from '../boards';
import CommentSection, { type CommentAuthor, type CommentNode } from './comment-section';
import LikeButton from './like-button';
import PostActions from './post-actions';
import PinToggle from './pin-toggle';
import TradePanel from './trade-panel';
import { canTrade } from '@/app/lib/market';
import PollCard, { type PollData } from './poll-card';
import ShareButton from './share-button';
import ReportButton from '@/app/components/report-button';

import { canViewPost, canReplyToPost, supportsAdoption } from '@/app/lib/board-rules';
import { displayName } from '@/app/lib/display-name';

function buildCommentTree(
  comments: {
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date | null;
    parentId: string | null;
    authorId: string;
    anonymous: boolean;
    author: CommentAuthor;
  }[],
): CommentNode[] {
  const nodeById = new Map<string, CommentNode>();
  for (const c of comments) {
    nodeById.set(c.id, {
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt?.toISOString() ?? null,
      authorId: c.authorId,
      anonymous: c.anonymous,
      author: c.author,
      replies: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const c of comments) {
    const node = nodeById.get(c.id)!;
    if (c.parentId && nodeById.has(c.parentId)) {
      nodeById.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default async function PostPage({ params }: PageProps<'/community/[id]'>) {
  const { id } = await params;
  // 세션 조회와 글 조회는 서로를 기다릴 이유가 없다 — 한 번에 띄운다
  const [session, post] = await Promise.all([
    getSessionOptional(),
    prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { name: true, anonymousTag: true, role: true, starScore: true, rankBadgeVisible: true } },
        comments: { include: { author: { select: { name: true, anonymousTag: true, role: true, starScore: true, rankBadgeVisible: true } } }, orderBy: { createdAt: 'asc' } },
        attachments: {
          orderBy: { order: 'asc' },
          include: { votes: { select: { userId: true, optionIndex: true } } },
        },
        _count: { select: { likes: true } },
        // 중고글이면 거래 정보가 함께 온다(없으면 null)
        listing: true,
      },
    }),
  ]);
  if (!post) notFound();

  // 조회수 증가 — 응답을 막지 않는 fire-and-forget
  prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  const [viewer, myLike] = session
    ? await Promise.all([
        prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } }),
        prisma.postLike.findUnique({
          where: { postId_userId: { postId: id, userId: session.userId } },
          select: { id: true },
        }),
      ])
    : [null, null];
  const isAuthor = viewer?.id === post.authorId;
  const isAdmin = viewer?.role === 'admin';

  // 중고 거래 자격 — 이메일 인증 여부는 매물이 있을 때만 확인한다(auth.users 조회 1회)
  let tradeEligibility = { allowed: false, message: undefined as string | undefined };
  if (post.listing && session) {
    const rows = await prisma.$queryRaw<{ confirmed: boolean }[]>`
      SELECT (email_confirmed_at IS NOT NULL) AS confirmed
      FROM auth.users WHERE id = ${session.userId}::uuid LIMIT 1`.catch(() => []);
    const result = canTrade({ userId: session.userId, emailVerified: rows[0]?.confirmed === true });
    tradeEligibility = { allowed: result.allowed, message: result.message };
  } else if (post.listing) {
    const result = canTrade({ userId: null, emailVerified: false });
    tradeEligibility = { allowed: result.allowed, message: result.message };
  }

  // 비밀글 열람 차단 — 존재 자체를 노출하지 않도록 404 처리한다
  const me = { userId: session?.userId ?? null, role: viewer?.role ?? 'user' };
  if (!canViewPost(post, me)) notFound();

  const replyPermission = canReplyToPost(post, me);
  const canAdopt = supportsAdoption(post.board) && isAuthor && !post.adoptedCommentId;
  const likedByMe = !!myLike;
  const commentTree = buildCommentTree(post.comments);

  const images = post.attachments.filter((a) => a.kind === 'image');
  const files = post.attachments.filter((a) => a.kind === 'file');
  const youtubeVideos = post.attachments.filter((a) => a.kind === 'youtube');
  const links = post.attachments.filter((a) => a.kind === 'link');
  const codeSnippets = post.attachments.filter((a) => a.kind === 'code');
  // 투표 첨부 — content(JSON)가 손상됐으면 렌더에서 제외
  const polls: PollData[] = post.attachments
    .filter((a) => a.kind === 'poll' && a.content)
    .flatMap((a) => {
      try {
        const { options } = JSON.parse(a.content!) as { options: string[] };
        return Array.isArray(options) && options.length >= 2
          ? [{ id: a.id, question: a.label, options, votes: a.votes }]
          : [];
      } catch {
        return [];
      }
    });
  const bodyContent = post.content.trim();

  return (
    <PageShell width="3xl">
        <BackButton label={`${boardLabel(post.board)}로 돌아가기`} className="mb-4" />
        <article className="mt-4">
          {/* 머리말 — 분류 배지 → 제목 → 작성 정보. 관리 버튼은 오른쪽 끝에 모은다 */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-paper px-2 py-0.5 font-mono text-[10px] text-fg-muted ring-1 ring-inset ring-ink/10">
              {boardLabel(post.board)}
            </span>
            {post.type === 'link' && (
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${platformColor(post.snsPlatform)}`}>
                {platformLabel(post.snsPlatform)}
              </span>
            )}
            {post.secret && (
              <span className="rounded bg-paper px-2 py-0.5 font-mono text-[10px] text-fg-muted">비밀글</span>
            )}
          </div>
          <h1 className="font-display text-2xl font-bold leading-snug tracking-tight text-fg">
            {post.bounty && !post.adoptedCommentId && (
              <span
                className="mr-2 align-middle rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700"
                title="답변이 채택되면 답변자에게 지급되는 포인트입니다"
              >
                채택 {post.bounty}P
              </span>
            )}
            {post.pinned && (
              <span
                className="mr-2 align-middle rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-800"
                title="모든 게시판 상단에 고정된 공지입니다"
              >
                📌 공지
              </span>
            )}
            {post.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline pb-4">
            <span data-no-translate className="text-sm font-semibold text-fg">{displayName(post.author, post.anonymous)}</span>
            <span className="font-mono text-[11px] text-fg-quiet">
              {new Date(post.createdAt).toLocaleString('ko-KR')}
              {post.updatedAt && <span className="ml-1 text-fg-quiet">(수정됨)</span>}
              <span className="ml-2.5">조회 {post.viewCount + 1}</span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              {!isAuthor && <ReportButton targetType="post" targetId={post.id} variant="icon" />}
              {isAdmin && <PinToggle postId={post.id} pinned={post.pinned} />}
              {(isAuthor || isAdmin) && <PostActions postId={post.id} canEdit={isAuthor} />}
            </div>
          </div>
          {/* 중고 매물 — 가격·상태·거래 방법을 본문보다 먼저 보여 준다 */}
          {post.listing && (
            <div className="mt-5">
              <TradePanel
                listing={post.listing}
                isSeller={post.listing.sellerId === viewer?.id}
                canTrade={tradeEligibility.allowed}
                tradeBlockedReason={tradeEligibility.message}
              />
            </div>
          )}

          {images.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {images.map((img) => (
                <img key={img.id} src={img.url!} alt={img.label ?? post.title} className="w-full rounded-xl border border-hairline object-cover" />
              ))}
            </div>
          )}
          {youtubeVideos.map((yt) => (
            <div key={yt.id} className="mt-5 aspect-video overflow-hidden rounded-xl border border-hairline bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${yt.url!.split('v=')[1]?.split('&')[0] ?? yt.url!.split('youtu.be/')[1]?.split('?')[0] ?? ''}`}
                title={post.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          ))}
          {bodyContent && (
            // 작성 시 입력한 엔터/띄어쓰기가 그대로 보이도록 문단 내부 공백을 보존한다
            <div className="mt-5 break-words text-[15px] leading-relaxed text-fg [&_p]:whitespace-pre-wrap [&_li]:whitespace-pre-wrap [&_p]:my-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyContent}</ReactMarkdown>
            </div>
          )}
          {polls.map((poll) => (
            <PollCard key={poll.id} poll={poll} currentUserId={session?.userId ?? null} />
          ))}
          {codeSnippets.map((snippet) => (
            <pre key={snippet.id} className="mt-5 overflow-x-auto rounded-lg bg-paper p-4 text-sm text-fg">
              {snippet.language && <div className="mb-2 font-mono text-[11px] text-fg-quiet">{snippet.language}</div>}
              <code>{snippet.content}</code>
            </pre>
          ))}
          {links.length > 0 && (
            <ul className="mt-5 space-y-2 border-t border-hairline pt-4 text-sm text-fg-secondary">
              {links.map((link) => (
                <li key={link.id} className="flex items-center gap-2">
                  <span className="text-brand-600">•</span>
                  <a href={link.url!} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline break-all">
                    {link.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && (
            <ul className="mt-5 space-y-2 border-t border-hairline pt-4 text-sm text-fg-secondary">
              {files.map((file) => (
                <li key={file.id} className="flex items-center gap-2">
                  <span className="text-brand-600">📎</span>
                  <a href={file.url!} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">
                    {file.label ?? file.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {post.type === 'link' && post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-500 transition-colors"
            >
              원문 보러가기 ↗
            </a>
          )}
          {/* 반응 — 좋아요를 왼쪽에 세우고 공유는 보조로 붙인다.
              번역은 여기 없다. 앱 설정 언어를 따라 본문과 댓글이 그 자리에서 번역된다. */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-hairline pt-5">
            <LikeButton postId={post.id} likeCount={post._count.likes} likedByMe={likedByMe} loggedIn={!!session} />
            <ShareButton title={post.title} />
          </div>
        </article>
        <CommentSection
          postId={post.id}
          comments={commentTree}
          currentUserId={session?.userId ?? null}
          isAdmin={isAdmin}
          replyPermission={replyPermission}
          canAdopt={canAdopt}
          adoptedCommentId={post.adoptedCommentId}
        />
    </PageShell>
  );
}
