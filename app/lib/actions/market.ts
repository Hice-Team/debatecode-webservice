'use server';

// 중고 거래 — 매물 상태 변경과 1:1 대화.
//
// 매물 등록 자체는 커뮤니티 글쓰기(createPost)에 얹혀 있다. 중고글도 결국 게시글이고,
// 첨부·신고·삭제 같은 것을 두 벌 만들 이유가 없다. 여기서는 글에는 없는 것만 다룬다.
import { revalidatePath } from 'next/cache';
import { verifySession } from '../dal';
import { prisma } from '../prisma';
import { rateLimit } from '../rate-limit';
import { sanctionMessage } from '../moderation';
import {
  LISTING_STATUS_META,
  canTrade,
  isListingStatus,
  type ListingStatus,
} from '../market';

export interface MarketState {
  ok?: boolean;
  error?: string;
}

const MAX_MESSAGE = 2000;

/**
 * 이메일 인증 여부 — Supabase auth.users의 확인 시각을 본다.
 *
 * public.User에 사본을 두지 않는 이유: 인증 상태는 Supabase가 바꾸므로, 사본을 두면
 * 언젠가 반드시 어긋난다. 거래 시작처럼 드문 동작에서만 확인하면 되는 값이다.
 */
async function isEmailVerified(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ confirmed: boolean }[]>`
    SELECT (email_confirmed_at IS NOT NULL) AS confirmed
    FROM auth.users WHERE id = ${userId}::uuid LIMIT 1`.catch(() => []);
  return rows[0]?.confirmed === true;
}

/** 거래 자격 확인 — 로그인 + 이메일 인증 + 제재 없음. */
async function assertCanTrade(userId: string): Promise<string | null> {
  const eligibility = canTrade({ userId, emailVerified: await isEmailVerified(userId) });
  if (!eligibility.allowed) return eligibility.message ?? '거래할 수 없습니다.';
  return sanctionMessage(userId, 'post');
}

/* ---------- 거래 상태 ---------- */

/**
 * 판매중 / 예약중 / 판매완료 전환.
 *
 * 판매자만 바꾼다. 구매자가 "예약중"으로 돌릴 수 있으면 아직 합의하지 않은 거래가
 * 선점되고, 다른 구매자는 이유도 모른 채 밀려난다.
 *
 * 바뀐 사실은 대화방에도 시스템 메시지로 남긴다 — 채팅·게시글·대시보드 세 곳이
 * 같은 상태를 보게 하는 가장 단순한 방법이다.
 */
export async function setListingStatus(formData: FormData): Promise<MarketState> {
  const { userId } = await verifySession();

  const listingId = String(formData.get('listingId') ?? '');
  const nextRaw = String(formData.get('status') ?? '');
  if (!listingId || !isListingStatus(nextRaw)) return { error: '잘못된 요청입니다.' };
  const next: ListingStatus = nextRaw;

  const listing = await prisma.marketListing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, status: true, postId: true },
  });
  if (!listing) return { error: '매물을 찾지 못했습니다.' };
  if (listing.sellerId !== userId) return { error: '판매자만 거래 상태를 바꿀 수 있습니다.' };
  if (listing.status === next) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.marketListing.update({
      where: { id: listingId },
      data: { status: next, soldAt: next === 'sold' ? new Date() : null },
    });

    // 진행 중인 대화마다 상태 변경을 남긴다
    const chats = await tx.marketChat.findMany({ where: { listingId }, select: { id: true } });
    if (chats.length > 0) {
      const now = new Date();
      await tx.marketMessage.createMany({
        data: chats.map((chat) => ({
          chatId: chat.id,
          senderId: userId,
          content: `거래 상태가 '${LISTING_STATUS_META[next].label}'으로 바뀌었습니다.`,
          systemKind: next,
          createdAt: now,
        })),
      });
      await tx.marketChat.updateMany({ where: { listingId }, data: { lastMessageAt: now } });
    }
  });

  revalidatePath(`/community/${listing.postId}`);
  revalidatePath('/dashboard/market');
  return { ok: true };
}

/* ---------- 1:1 대화 ---------- */

/**
 * 대화 시작 — "상품 거래하기" 버튼.
 *
 * 같은 매물에 같은 구매자는 방 하나만 갖는다(unique). 버튼을 다시 눌러도 새 방이
 * 생기지 않고 하던 대화로 돌아간다.
 */
export async function startChat(formData: FormData): Promise<MarketState & { chatId?: string }> {
  const { userId } = await verifySession();

  const blocked = await assertCanTrade(userId);
  if (blocked) return { error: blocked };

  const listingId = String(formData.get('listingId') ?? '');
  if (!listingId) return { error: '매물을 찾지 못했습니다.' };

  const listing = await prisma.marketListing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, status: true },
  });
  if (!listing) return { error: '매물을 찾지 못했습니다.' };
  if (listing.sellerId === userId) return { error: '자기 매물에는 거래를 요청할 수 없습니다.' };
  if (listing.status === 'sold') return { error: '이미 판매가 끝난 매물입니다.' };

  const existing = await prisma.marketChat.findUnique({
    where: { listingId_buyerId: { listingId, buyerId: userId } },
    select: { id: true },
  });
  if (existing) {
    // 예전에 숨겼더라도 다시 열면 목록에 돌아온다
    await prisma.marketChat.update({ where: { id: existing.id }, data: { buyerHiddenAt: null } });
    return { ok: true, chatId: existing.id };
  }

  const created = await prisma.marketChat.create({
    data: { listingId, buyerId: userId, sellerId: listing.sellerId },
    select: { id: true },
  });

  revalidatePath('/dashboard/market');
  return { ok: true, chatId: created.id };
}

/** 이 대화의 참여자인지 확인하고 역할을 알려 준다. */
async function participantOf(chatId: string, userId: string) {
  const chat = await prisma.marketChat.findUnique({
    where: { id: chatId },
    select: { id: true, buyerId: true, sellerId: true, listing: { select: { status: true } } },
  });
  if (!chat) return null;
  if (chat.buyerId !== userId && chat.sellerId !== userId) return null;
  return chat;
}

export async function sendMessage(formData: FormData): Promise<MarketState> {
  const { userId } = await verifySession();

  if (!rateLimit(`market-msg:${userId}`, 30, 60_000)) {
    return { error: '메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해 주세요.' };
  }

  const chatId = String(formData.get('chatId') ?? '');
  const content = String(formData.get('content') ?? '').trim().slice(0, MAX_MESSAGE);
  if (!chatId || !content) return { error: '보낼 내용이 없습니다.' };

  const chat = await participantOf(chatId, userId);
  if (!chat) return { error: '대화를 찾지 못했습니다.' };

  const blocked = await sanctionMessage(userId, 'post');
  if (blocked) return { error: blocked };

  const now = new Date();
  await prisma.$transaction([
    prisma.marketMessage.create({ data: { chatId, senderId: userId, content, createdAt: now } }),
    // 상대가 숨겨 뒀더라도 새 메시지가 오면 목록에 다시 올라온다
    prisma.marketChat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: now,
        ...(chat.buyerId === userId ? { sellerHiddenAt: null } : { buyerHiddenAt: null }),
      },
    }),
  ]);

  revalidatePath('/dashboard/market');
  return { ok: true };
}

/** 메시지 수정 — 보낸 사람만. 시스템 메시지는 고칠 수 없다. */
export async function editMessage(formData: FormData): Promise<MarketState> {
  const { userId } = await verifySession();

  const messageId = String(formData.get('messageId') ?? '');
  const content = String(formData.get('content') ?? '').trim().slice(0, MAX_MESSAGE);
  if (!messageId || !content) return { error: '내용을 입력해 주세요.' };

  const message = await prisma.marketMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, systemKind: true, deletedAt: true },
  });
  if (!message || message.senderId !== userId) return { error: '수정할 수 없는 메시지입니다.' };
  if (message.systemKind) return { error: '거래 상태 알림은 수정할 수 없습니다.' };
  if (message.deletedAt) return { error: '이미 삭제된 메시지입니다.' };

  await prisma.marketMessage.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
  });
  revalidatePath('/dashboard/market');
  return { ok: true };
}

/**
 * 메시지 삭제 — 행을 지우지 않고 표시만 남긴다.
 *
 * 실제로 지우면 대화 흐름에 구멍이 나서 상대는 무슨 말이 오갔는지 알 수 없고,
 * 분쟁이 생겼을 때 확인할 근거도 사라진다.
 */
export async function deleteMessage(formData: FormData): Promise<MarketState> {
  const { userId } = await verifySession();

  const messageId = String(formData.get('messageId') ?? '');
  if (!messageId) return { error: '대상을 찾지 못했습니다.' };

  const message = await prisma.marketMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, systemKind: true },
  });
  if (!message || message.senderId !== userId) return { error: '삭제할 수 없는 메시지입니다.' };
  if (message.systemKind) return { error: '거래 상태 알림은 삭제할 수 없습니다.' };

  await prisma.marketMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  revalidatePath('/dashboard/market');
  return { ok: true };
}

/**
 * 대화 숨기기 — 내 목록에서만 감춘다.
 *
 * 요구사항은 "사용자가 삭제할 때까지 유지"다. 한쪽이 지웠다고 양쪽 기록이 사라지면
 * 남은 사람이 거래 근거를 잃으므로, 각자 자기 목록에서만 치운다.
 */
export async function hideChat(formData: FormData): Promise<MarketState> {
  const { userId } = await verifySession();

  const chatId = String(formData.get('chatId') ?? '');
  if (!chatId) return { error: '대화를 찾지 못했습니다.' };

  const chat = await participantOf(chatId, userId);
  if (!chat) return { error: '대화를 찾지 못했습니다.' };

  const now = new Date();
  await prisma.marketChat.update({
    where: { id: chatId },
    data: chat.buyerId === userId ? { buyerHiddenAt: now } : { sellerHiddenAt: now },
  });

  revalidatePath('/dashboard/market');
  return { ok: true };
}

/** 읽음 처리 — 상대가 보낸 안 읽은 메시지에 시각을 찍는다. */
export async function markChatRead(chatId: string): Promise<void> {
  const { userId } = await verifySession();
  const chat = await participantOf(chatId, userId);
  if (!chat) return;

  await prisma.marketMessage.updateMany({
    where: { chatId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
}
