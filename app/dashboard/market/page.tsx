import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { markChatRead } from '@/app/lib/actions/market';
import {
  CONDITION_LABELS,
  LISTING_STATUS_META,
  formatPrice,
  type Condition,
  type ListingStatus,
} from '@/app/lib/market';
import ChatRoom, { type ChatMessage } from './chat-room';

export const metadata: Metadata = { title: '중고 거래' };

// 중고 거래 관리 — 내가 파는 것과 사려고 말 건 것을 한 화면에서 본다.
//
// 두 목록을 따로 두지 않은 이유: 같은 사람이 어제는 팔고 오늘은 산다. 역할로 화면을
// 가르면 "내 거래"를 보려고 두 곳을 오가야 한다. 한 목록에 역할 배지만 붙인다.
const MESSAGE_LIMIT = 200;

export default async function MarketDashboardPage({ searchParams }: PageProps<'/dashboard/market'>) {
  const user = await getUser();
  const { chat: chatParam } = await searchParams;
  const selectedId = typeof chatParam === 'string' ? chatParam : null;

  // 내가 숨긴 대화는 목록에서 뺀다(상대 기록은 그대로 남는다)
  const chats = await prisma.marketChat.findMany({
    where: {
      OR: [
        { buyerId: user.id, buyerHiddenAt: null },
        { sellerId: user.id, sellerHiddenAt: null },
      ],
    },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      lastMessageAt: true,
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      listing: {
        select: {
          id: true,
          price: true,
          status: true,
          condition: true,
          postId: true,
          post: { select: { title: true } },
        },
      },
      _count: {
        select: { messages: { where: { senderId: { not: user.id }, readAt: null, deletedAt: null } } },
      },
    },
  });

  const selected = selectedId ? chats.find((c) => c.id === selectedId) : null;

  let messages: ChatMessage[] = [];
  if (selected) {
    // 열어 본 대화는 읽음 처리 — 목록의 안 읽음 배지가 남아 있으면 신뢰를 잃는다
    await markChatRead(selected.id);
    const rows = await prisma.marketMessage.findMany({
      where: { chatId: selected.id },
      orderBy: { createdAt: 'asc' },
      take: MESSAGE_LIMIT,
      select: {
        id: true,
        senderId: true,
        content: true,
        systemKind: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
      },
    });
    messages = rows.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
    }));
  }

  return (
    <PageShell width="6xl">
      <BackButton label="대시보드로 돌아가기" className="mb-4" />
      <PageHeader
        slug="market"
        title="중고 거래"
        desc="내가 올린 매물과 거래 대화를 한곳에서 관리합니다."
        className="mb-6"
      />

      {chats.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-hairline px-6 py-16 text-center">
          <p className="text-sm font-semibold text-fg-secondary">아직 거래 대화가 없습니다.</p>
          <p className="mt-1 text-xs text-fg-muted">
            중고게시판에서 마음에 드는 매물의 &apos;거래하기&apos;를 누르면 여기에 대화가 생깁니다.
          </p>
          <Link
            href="/community?board=market"
            className="mt-4 inline-block rounded-full bg-signal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            중고게시판 열기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          {/* 대화 목록 */}
          <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
            {chats.map((chat) => {
              const amSeller = chat.sellerId === user.id;
              const counterpart = amSeller ? chat.buyer.name : chat.seller.name;
              const status = LISTING_STATUS_META[chat.listing.status as ListingStatus];
              const unread = chat._count.messages;
              const active = chat.id === selectedId;

              return (
                <li key={chat.id}>
                  <Link
                    href={`/dashboard/market?chat=${chat.id}`}
                    className={`block px-4 py-3 transition-colors ${active ? 'bg-brand-50/60' : 'hover:bg-paper'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-full border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                        {amSeller ? '판매' : '구매'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                        {chat.listing.post.title}
                      </span>
                      {unread > 0 && (
                        <span className="dc-num shrink-0 rounded-full bg-signal px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="dc-num text-[12px] font-semibold text-fg-secondary">
                        {formatPrice(chat.listing.price)}
                      </span>
                      {status && (
                        <span className={`shrink-0 rounded-full border px-1.5 py-px font-mono text-[10px] ${status.tone}`}>
                          {status.label}
                        </span>
                      )}
                      <span className="min-w-0 truncate text-[11px] text-fg-muted">{counterpart}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* 대화방 */}
          <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-paper/40">
            {selected ? (
              <>
                <div className="shrink-0 border-b border-hairline bg-white px-4 py-3">
                  <Link
                    href={`/community/${selected.listing.postId}`}
                    className="text-sm font-semibold text-fg hover:text-signal"
                  >
                    {selected.listing.post.title}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    <span className="dc-num">{formatPrice(selected.listing.price)}</span>
                    {' · '}
                    {CONDITION_LABELS[selected.listing.condition as Condition] ?? selected.listing.condition}
                  </p>
                </div>
                <ChatRoom
                  chatId={selected.id}
                  meId={user.id}
                  counterpartName={selected.sellerId === user.id ? selected.buyer.name : selected.seller.name}
                  messages={messages}
                />
              </>
            ) : (
              <p className="grid flex-1 place-items-center px-6 text-center text-sm text-fg-muted">
                왼쪽에서 대화를 고르면 여기에 열립니다.
              </p>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
