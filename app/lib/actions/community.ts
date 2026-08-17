'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { verifySession, getUser } from '../dal';
import { createClient } from '../supabase/server';
import { sanctionMessage } from '../moderation';
import { safeStorageKey } from '../storage';
import { forcedSecret, supportsVerifiedOnly } from '../board-rules';
import { ensureAnonymousTag } from '../identity';

export interface PostFormState {
  errors?: {
    title?: string[];
    content?: string[];
    url?: string[];
    form?: string[];
  };
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;
const MAX_IMAGES = 5;

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
  for (const f of [...files, ...images]) {
    if (f.size > MAX_FILE_BYTES) return { error: `"${f.name}"의 용량이 너무 큽니다. (최대 10MB)` };
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
        anonymous: !!anonymous,
        // 문의게시판은 게시판 규칙상 항상 비밀글
        secret: forcedSecret(board),
        // '인증된 사용자에게만 답변 받기'는 멘토게시판에서만 의미가 있다
        verifiedOnlyReplies: supportsVerifiedOnly(board) ? !!verifiedOnlyReplies : false,
      },
    });
    if (attachments.length > 0) {
      await tx.attachment.createMany({
        data: attachments.map((a) => ({ ...a, postId: created.id })),
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
