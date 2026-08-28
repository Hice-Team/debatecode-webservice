'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { verifySession, getUser } from '../dal';
import { createClient } from '../supabase/server';
import { sanctionMessage } from '../moderation';
import { featureBlockMessage } from '../settings';
import { safeStorageKey } from '../storage';
import {
  canWriteToBoard,
  clampBounty,
  forcedSecret,
  supportsAnonymous,
  supportsBounty,
  supportsPinning,
  supportsSecret,
  supportsVerifiedOnly,
} from '../board-rules';
import { ensureAnonymousTag } from '../identity';
import { canTrade, isCondition, parsePrice, MAX_SHIPPING_FEE } from '../market';
import { can } from '../permissions-server';
import { audit } from '../audit';

export interface PostFormState {
  errors?: {
    title?: string[];
    content?: string[];
    url?: string[];
    // 중고게시판 전용 입력
    price?: string[];
    region?: string[];
    form?: string[];
  };
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — 파일 하나의 상한
const MAX_FILES = 5;
const MAX_IMAGES = 5;

/**
 * 한 글에 붙는 첨부의 **합계** 상한.
 *
 * 개별 검증만 있으면 10MB × 10개 = 100MB가 통과한다. 그런데 서버 액션 본문 한도는
 * 25MB다(next.config.ts의 bodySizeLimit). 그 한도는 이 함수에 닿기 **전에** 걸리므로,
 * 이용자는 "무엇이 잘못됐는지 알려주지 않는 실패"를 보고 작성 중이던 글까지 잃는다.
 *
 * 그래서 합계를 body 한도보다 낮게 잡아 여기서 먼저 걸러 낸다. 값을 바꿀 때는 세 곳을
 * 함께 본다 — next.config.ts의 bodySizeLimit, 이 상수, 그리고 화면 쪽 같은 이름의 상수
 * (app/community/write/attachment-composer.tsx). 어긋나면 "화면은 통과시키는데 서버가
 * 거절하는" 상태가 된다.
 *
 * 이 파일은 'use server'라서 async 함수 외의 export를 둘 수 없다 — 그래서 내보내지 않고
 * 화면 쪽에 같은 값을 따로 적어 둔다.
 */
const MAX_TOTAL_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB (bodySizeLimit 25MB보다 낮게)

// href로 렌더되는 사용자 입력 URL은 http/https만 허용 — javascript: 등 스킴 차단
const HTTP_URL = z
  .url('올바른 URL 형식이 아닙니다.')
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), 'http/https URL만 사용할 수 있습니다.');

function isYoutubeUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
  } catch {
    return false;
  }
}

const postSchema = z
  .object({
    board: z.enum(['free', 'notice', 'support', 'mentor', 'qna', 'market', 'sns']),
    anonymous: z.boolean().optional(),
    verifiedOnlyReplies: z.boolean().optional(),
    title: z.string().min(2, '제목은 2자 이상이어야 합니다.').max(100, '제목은 100자 이하여야 합니다.'),
    content: z.string().min(10, '내용은 10자 이상이어야 합니다.').max(10_000, '내용이 너무 깁니다.'),
    url: HTTP_URL.optional().or(z.literal('')),
    snsPlatform: z.string().max(20).optional().or(z.literal('')),
    youtubeUrls: z.string().max(2000).optional().or(z.literal('')),
    links: z.string().max(2000).optional().or(z.literal('')),
    codeSnippet: z.string().max(4000).optional().or(z.literal('')),
    codeLanguage: z.string().max(30).optional().or(z.literal('')),
  })
  .refine((d) => (d.board === 'sns' ? !!d.url : true), {
    message: 'SNS 게시판은 외부 링크(URL)가 필요합니다.',
    path: ['url'],
  });

/**
 * 이메일 인증 여부.
 *
 * 예전에는 `auth.users.email_confirmed_at`을 봤다. 그런데 가입이
 * `admin.createUser({ email_confirm: true })`로 계정을 즉시 확정 생성하므로 그 값은
 * **모든 계정에서 항상 채워져 있다**. 즉 이 함수는 언제나 true를 돌려줬고,
 * "인증한 계정만" 이라는 조건이 걸린 자리(중고거래 판매자 배지, 멘토게시판의
 * 인증 계정 전용 답변)는 사실상 전원 통과 상태였다.
 *
 * 지금은 실제로 코드를 확인한 시각(User.emailVerifiedAt)만 본다.
 */
async function isEmailVerified(userId: string): Promise<boolean> {
  const row = await prisma.user
    .findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } })
    .catch(() => null);
  return !!row?.emailVerifiedAt;
}

function parseLines(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type NewAttachment = {
  kind: string;
  url?: string | null;
  label?: string | null;
  content?: string | null;
  language?: string | null;
  order: number;
};

const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 6;

// 폼에서 첨부(파일/이미지 업로드 + 유튜브/링크/코드/투표)를 수집한다.
// createPost와 updatePost가 공유. 실패 시 error 메시지 반환.
async function collectAttachments(
  formData: FormData,
  userId: string,
  startOrder = 0,
): Promise<{ attachments: NewAttachment[] } | { error: string }> {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const images = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return { error: `파일은 최대 ${MAX_FILES}개까지 첨부할 수 있습니다.` };
  if (images.length > MAX_IMAGES) return { error: `이미지는 최대 ${MAX_IMAGES}개까지 첨부할 수 있습니다.` };
  let total = 0;
  for (const f of [...files, ...images]) {
    if (f.size > MAX_FILE_BYTES) return { error: `"${f.name}"의 용량이 너무 큽니다. (최대 10MB)` };
    total += f.size;
  }
  if (total > MAX_TOTAL_UPLOAD_BYTES) {
    const mb = (total / 1024 / 1024).toFixed(1);
    return {
      error: `첨부 파일 합계가 너무 큽니다. (${mb}MB / 최대 ${MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024}MB) 일부를 빼고 다시 올려 주세요.`,
    };
  }

  const supabase = await createClient();
  const attachments: NewAttachment[] = [];
  let order = startOrder;

  for (const kind of ['file', 'image'] as const) {
    const list = kind === 'file' ? files : images;
    for (const f of list) {
      // 키에는 원본 파일명을 넣지 않는다(한글/공백 → Invalid key). 원본명은 label로 보존.
      const path = safeStorageKey(userId, f.name);
      const { error } = await supabase.storage.from('community-uploads').upload(path, f, {
        contentType: f.type || undefined,
      });
      if (error) return { error: `파일 업로드에 실패했습니다: ${error.message}` };
      const { data } = supabase.storage.from('community-uploads').getPublicUrl(path);
      attachments.push({ kind, url: data.publicUrl, label: f.name, order: order++ });
    }
  }

  // 첨부 URL은 저장 전에 스킴/도메인 검증 — href/iframe src로 그대로 렌더되기 때문
  for (const line of parseLines(String(formData.get('youtubeUrls') ?? ''))) {
    if (!isYoutubeUrl(line)) return { error: `유튜브 URL이 아닙니다: ${line}` };
    attachments.push({ kind: 'youtube', url: line, order: order++ });
  }
  for (const line of parseLines(String(formData.get('links') ?? ''))) {
    if (!HTTP_URL.safeParse(line).success) return { error: `올바른 http/https 링크가 아닙니다: ${line}` };
    attachments.push({ kind: 'link', url: line, order: order++ });
  }

  const codeSnippet = String(formData.get('codeSnippet') ?? '').trim();
  if (codeSnippet) {
    const codeLanguage = String(formData.get('codeLanguage') ?? '').trim();
    attachments.push({ kind: 'code', content: codeSnippet.slice(0, 4000), language: codeLanguage || null, order: order++ });
  }

  // 투표 — pollOptions가 하나라도 채워져 있으면 유효성 검사 후 poll 첨부 생성
  const pollOptions = formData
    .getAll('pollOptions')
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (pollOptions.length > 0) {
    if (pollOptions.length < MIN_POLL_OPTIONS) return { error: `투표 선택지는 ${MIN_POLL_OPTIONS}개 이상이어야 합니다.` };
    if (pollOptions.length > MAX_POLL_OPTIONS) return { error: `투표 선택지는 최대 ${MAX_POLL_OPTIONS}개입니다.` };
    if (pollOptions.some((o) => o.length > 50)) return { error: '투표 선택지는 50자 이하여야 합니다.' };
    const question = String(formData.get('pollQuestion') ?? '').trim().slice(0, 100);
    attachments.push({
      kind: 'poll',
      label: question || null,
      content: JSON.stringify({ options: pollOptions }),
      order: order++,
    });
  }

  return { attachments };
}

export async function createPost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const session = await verifySession();

  // 운영 킬 스위치 — 스팸이 쏟아질 때 콘솔에서 쓰기만 잠근다(읽기는 열어 둔다)
  const blocked = await featureBlockMessage('flag.community_write');
  if (blocked) return { errors: { form: [blocked] } };

  const suspended = await sanctionMessage(session.userId, 'post');
  if (suspended) return { errors: { form: [suspended] } };

  const parsed = postSchema.safeParse({
    board: formData.get('board'),
    anonymous: formData.get('anonymous') === 'on',
    verifiedOnlyReplies: formData.get('verifiedOnlyReplies') === 'on',
    title: formData.get('title'),
    content: formData.get('content'),
    url: formData.get('url') ?? '',
    snsPlatform: formData.get('snsPlatform') ?? '',
    youtubeUrls: formData.get('youtubeUrls') ?? '',
    links: formData.get('links') ?? '',
    codeSnippet: formData.get('codeSnippet') ?? '',
    codeLanguage: formData.get('codeLanguage') ?? '',
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { board, title, content, url, snsPlatform, anonymous, verifiedOnlyReplies } = parsed.data;

  // 공지사항은 관리자만 — 게시판 규칙이 판단한다(app/lib/board-rules.ts)
  const author = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });
  if (!canWriteToBoard(board, author?.role ?? 'user')) {
    return { errors: { form: ['이 게시판에는 글을 쓸 수 없습니다.'] } };
  }
  // 상단 고정은 공지사항에서만, 그리고 그 게시판에 쓸 수 있는 사람만 켤 수 있다
  const pinned = supportsPinning(board) && formData.get('pinned') === 'on';
  // 문의게시판 — 질문자가 공개/비밀과 채택 포인트를 직접 고른다
  const secret = forcedSecret(board) || (supportsSecret(board) && formData.get('secret') === 'on');
  const bounty = supportsBounty(board) ? clampBounty(formData.get('bounty')) : null;

  /* ---------- 중고 거래 ----------
     중고글은 게시글이면서 동시에 매물이다. 글만 만들고 매물을 못 만들면 "가격 없는 중고글"이
     남으므로 검증을 먼저 끝내고 트랜잭션 안에서 함께 만든다. */
  let listing: {
    price: number;
    condition: string;
    conditionNote: string | null;
    region: string | null;
    shipping: boolean;
    shippingFee: number | null;
    sellerVerified: boolean;
  } | null = null;

  if (board === 'market') {
    // 중고 거래는 이 서비스에서 유일하게 금전이 오가는 자리라 이메일 인증을 요구한다
    const verified = await isEmailVerified(session.userId);
    const eligibility = canTrade({ userId: session.userId, emailVerified: verified });
    if (!eligibility.allowed) return { errors: { form: [eligibility.message ?? '거래할 수 없습니다.'] } };

    const price = parsePrice(formData.get('price'));
    if (price === null) return { errors: { price: ['판매 가격을 숫자로 입력해 주세요. (나눔은 0)'] } };

    const conditionRaw = String(formData.get('condition') ?? 'used');
    if (!isCondition(conditionRaw)) return { errors: { form: ['상품 상태를 골라 주세요.'] } };

    const shipping = formData.get('shipping') === 'on';
    const region = String(formData.get('region') ?? '').trim().slice(0, 60) || null;
    if (!shipping && !region) {
      return { errors: { region: ['직거래 희망 장소를 적거나 택배 거래를 켜 주세요.'] } };
    }

    const shippingFee = shipping ? parsePrice(formData.get('shippingFee'), MAX_SHIPPING_FEE) : null;

    listing = {
      price,
      condition: conditionRaw,
      conditionNote: String(formData.get('conditionNote') ?? '').trim().slice(0, 300) || null,
      region,
      shipping,
      shippingFee,
      sellerVerified: verified,
    };
  }

  // 익명 글이면 표시용 식별자를 미리 확보해 둔다(없으면 생성)
  if (anonymous) await ensureAnonymousTag(session.userId);

  const collected = await collectAttachments(formData, session.userId);
  if ('error' in collected) {
    return { errors: { form: [collected.error] } };
  }
  const { attachments } = collected;

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        board,
        title,
        content: content.trim(),
        authorId: session.userId,
        type: board === 'sns' ? 'link' : 'text',
        url: board === 'sns' ? url : null,
        snsPlatform: board === 'sns' ? snsPlatform || null : null,
        // 공지사항은 익명 불가 — 화면에서 감추는 것과 별개로 서버가 최종 판단한다
        anonymous: supportsAnonymous(board) && !!anonymous,
        secret,
        bounty,
        // '인증된 사용자에게만 답변 받기'는 멘토게시판에서만 의미가 있다
        verifiedOnlyReplies: supportsVerifiedOnly(board) ? !!verifiedOnlyReplies : false,
        pinned,
        pinnedAt: pinned ? new Date() : null,
      },
    });
    if (attachments.length > 0) {
      await tx.attachment.createMany({
        data: attachments.map((a) => ({ ...a, postId: created.id })),
      });
    }
    if (listing) {
      await tx.marketListing.create({
        data: { ...listing, postId: created.id, sellerId: session.userId },
      });
    }
    return created;
  });

  redirect(`/community/${post.id}`);
}

const updatePostSchema = z.object({
  postId: z.string().min(1),
  title: z.string().min(2, '제목은 2자 이상이어야 합니다.').max(100, '제목은 100자 이하여야 합니다.'),
  content: z.string().min(10, '내용은 10자 이상이어야 합니다.').max(10_000, '내용이 너무 깁니다.'),
});

// 글 수정 — 작성자 본인만. 제목/본문 수정 + 기존 첨부 제거(removeAttachments) + 새 첨부 추가.
export async function updatePost(_prev: PostFormState, formData: FormData): Promise<PostFormState> {
  const session = await verifySession();

  const parsed = updatePostSchema.safeParse({
    postId: formData.get('postId'),
    title: formData.get('title'),
    content: formData.get('content'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { postId, title, content } = parsed.data;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, attachments: { select: { id: true, order: true } } },
  });
  if (!post || post.authorId !== session.userId) {
    return { errors: { form: ['수정 권한이 없습니다.'] } };
  }

  // 제거할 첨부 — 이 글에 속한 것만 인정
  const ownIds = new Set(post.attachments.map((a) => a.id));
  const removeIds = formData
    .getAll('removeAttachments')
    .map(String)
    .filter((id) => ownIds.has(id));

  const maxOrder = post.attachments.reduce((m, a) => Math.max(m, a.order), -1);
  const collected = await collectAttachments(formData, session.userId, maxOrder + 1);
  if ('error' in collected) {
    return { errors: { form: [collected.error] } };
  }
  const { attachments } = collected;

  await prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: postId },
      data: { title, content: content.trim(), updatedAt: new Date() },
    });
    if (removeIds.length > 0) {
      await tx.attachment.deleteMany({ where: { id: { in: removeIds }, postId } });
    }
    if (attachments.length > 0) {
      await tx.attachment.createMany({ data: attachments.map((a) => ({ ...a, postId })) });
    }
  });

  redirect(`/community/${postId}`);
}

// 투표 — 같은 선택지를 다시 누르면 취소, 다른 선택지를 누르면 변경
export async function votePoll(formData: FormData): Promise<void> {
  const session = await verifySession();
  const attachmentId = String(formData.get('attachmentId') ?? '');
  const optionIndex = Number(formData.get('optionIndex'));
  if (!attachmentId || !Number.isInteger(optionIndex) || optionIndex < 0) return;

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: { kind: true, content: true, postId: true },
  });
  if (!attachment || attachment.kind !== 'poll' || !attachment.content) return;

  let optionCount = 0;
  try {
    optionCount = (JSON.parse(attachment.content).options as string[]).length;
  } catch {
    return;
  }
  if (optionIndex >= optionCount) return;

  const existing = await prisma.pollVote.findUnique({
    where: { attachmentId_userId: { attachmentId, userId: session.userId } },
  });
  if (existing && existing.optionIndex === optionIndex) {
    await prisma.pollVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.pollVote.upsert({
      where: { attachmentId_userId: { attachmentId, userId: session.userId } },
      create: { attachmentId, userId: session.userId, optionIndex },
      update: { optionIndex },
    });
  }
  revalidatePath(`/community/${attachment.postId}`);
}

// 글 삭제 — 작성자 또는 관리자. 댓글/첨부/좋아요는 FK cascade로 함께 삭제.
// Storage의 업로드 파일은 잔존 허용(공개 버킷, 데모 스코프).
export async function deletePost(formData: FormData): Promise<void> {
  const user = await getUser();
  const postId = String(formData.get('postId') ?? '');

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (!post || (post.authorId !== user.id && user.role !== 'admin')) {
    redirect(`/community/${postId}`);
  }

  await prisma.post.delete({ where: { id: postId } });
  revalidatePath('/community');
  redirect('/community');
}

// 좋아요 토글
export async function togglePostLike(formData: FormData): Promise<void> {
  const session = await verifySession();
  const postId = String(formData.get('postId') ?? '');
  if (!postId) return;

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId: session.userId } },
  });
  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.postLike.create({ data: { postId, userId: session.userId } }).catch(() => {});
  }
  revalidatePath(`/community/${postId}`);
}

/**
 * 공지 상단 고정 토글.
 *
 * 커뮤니티 글 화면과 관리 콘솔이 같은 액션을 쓴다. 고정은 운영 판단이라 `announcement.manage`
 * 권한을 본다 — 글을 쓴 사람이라고 해서 전체 게시판 상단을 차지할 수 있으면 안 된다.
 */
export async function togglePostPin(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const session = await verifySession();
  const actor = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, role: true },
  });
  if (!actor) return { error: '계정을 찾지 못했습니다.' };
  if (!(await can(actor, 'announcement.manage'))) return { error: '고정할 권한이 없습니다.' };

  const postId = String(formData.get('postId') ?? '');
  if (!postId) return { error: '대상을 찾지 못했습니다.' };

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { pinned: true, title: true } });
  if (!post) return { error: '글을 찾지 못했습니다.' };

  const next = !post.pinned;
  await prisma.post.update({
    where: { id: postId },
    data: { pinned: next, pinnedAt: next ? new Date() : null },
  });

  await audit({
    actor,
    action: next ? 'post.pin' : 'post.unpin',
    targetType: 'post',
    targetId: postId,
    summary: `${next ? '공지 고정' : '고정 해제'} — ${post.title}`,
  });

  revalidatePath('/community');
  revalidatePath(`/community/${postId}`);
  return { ok: true };
}
