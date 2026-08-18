// 활성 팝업을 조회해 띄우는 서버 게이트.
//
// 로그인 여부와 무관하게 동작해야 한다 — 공개 팝업은 방문자에게 보이는 것이 목적이다.
// 그래서 세션을 전혀 보지 않고, 캐시된 응답에 갇히지 않도록 매 요청 조회한다.
// (정적으로 굳어 버리면 팝업을 새로 올려도 비로그인 방문자에게는 영영 안 뜬다.)
import { connection } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { isLive } from '@/app/lib/popups';
import AnnouncementPopup, { type PopupItem } from './announcement-popup';

export default async function AnnouncementGate() {
  // 이 컴포넌트를 요청 시점 렌더로 고정한다 — 빌드 시점에 굳으면 팝업이 갱신되지 않는다
  await connection();

  let items: PopupItem[] = [];
  try {
    const now = new Date();
    const rows = await prisma.announcement.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      take: 10,
      select: {
        id: true,
        title: true,
        content: true,
        imageUrl: true,
        variant: true,
        linkType: true,
        linkTarget: true,
        linkLabel: true,
        startsAt: true,
        endsAt: true,
      },
    });
    items = rows.filter((r) => isLive({ active: true, startsAt: r.startsAt, endsAt: r.endsAt }, now));
  } catch {
    // 레이아웃에서 렌더되므로 DB 장애가 페이지 전체를 무너뜨리지 않게 한다
    return null;
  }

  if (items.length === 0) return null;
  return <AnnouncementPopup items={items} />;
}
