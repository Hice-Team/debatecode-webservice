// 활성 공지를 조회해 팝업을 띄우는 서버 게이트.
// 레이아웃에서 렌더되므로 DB 장애가 페이지 전체를 무너뜨리지 않도록 방어한다.
import { prisma } from '@/app/lib/prisma';
import AnnouncementPopup from './announcement-popup';

export default async function AnnouncementGate() {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, content: true },
    });
    if (!announcement) return null;
    return <AnnouncementPopup {...announcement} />;
  } catch {
    return null;
  }
}
