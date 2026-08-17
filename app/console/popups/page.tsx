import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canGrantRoles } from '@/app/lib/roles';
import AnnouncementForm from '../announcement-form';
import AnnouncementManager from '../announcement-manager';
import { PageHeader } from '../ui';

export const metadata: Metadata = { title: '공지 팝업' };

// 전체 공지 팝업 — 활성 공지는 접속 시 사이트 전역 중앙 팝업으로 노출된다 (항상 1건만 활성).
export default async function PublicPopupsPage() {
  const user = await getUser();
  if (!canGrantRoles(user.role)) redirect('/console');

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, title: true, content: true, active: true, createdAt: true },
  });

  return (
    <div>
      <PageHeader
        eyebrow="PUBLIC POPUPS"
        title="공지사항 팝업"
        sub="활성 공지는 접속 시 중앙 팝업으로 노출됩니다. 새 공지를 게시하면 기존 활성 공지는 자동으로 내려갑니다."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-white p-5">
          <AnnouncementForm />
        </div>
        <AnnouncementManager items={announcements.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))} />
      </div>
    </div>
  );
}
