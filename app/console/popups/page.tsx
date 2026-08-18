import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { isLive } from '@/app/lib/popups';
import PopupEditor from './popup-editor';
import PopupList, { type PopupRow } from './popup-list';
import { PageHeader, SectionHeader, StatGrid, Callout } from '../ui';

export const metadata: Metadata = { title: '공개 팝업' };

export const dynamic = 'force-dynamic';

// 공개 팝업 — 접속하는 모든 방문자(비로그인 포함)에게 중앙 모달로 노출된다.
export default async function PublicPopupsPage() {
  const user = await getUser();
  if (!(await can(user, 'announcement.manage'))) redirect('/console');

  const rows = await prisma.announcement.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  const now = new Date();
  const items: PopupRow[] = rows.map((a) => {
    const live = isLive({ active: a.active, startsAt: a.startsAt, endsAt: a.endsAt }, now);
    // 켜 두었는데 안 뜨는 경우, 그 이유를 목록에서 바로 보여 준다
    let reason: string | null = null;
    if (a.active && !live) {
      if (a.startsAt && a.startsAt > now) reason = `${a.startsAt.toLocaleString('ko-KR')} 시작 예정`;
      else if (a.endsAt && a.endsAt < now) reason = '게시 기간 종료됨';
    }
    return {
      id: a.id,
      title: a.title,
      content: a.content,
      imageUrl: a.imageUrl,
      variant: a.variant,
      linkType: a.linkType,
      linkTarget: a.linkTarget,
      linkLabel: a.linkLabel,
      order: a.order,
      startsAt: a.startsAt ? a.startsAt.toISOString() : null,
      endsAt: a.endsAt ? a.endsAt.toISOString() : null,
      active: a.active,
      createdAt: a.createdAt.toISOString(),
      live,
      reason,
    };
  });

  const liveCount = items.filter((i) => i.live).length;
  const scheduled = items.filter((i) => i.active && !i.live && i.reason?.includes('시작')).length;
  const expired = items.filter((i) => i.active && !i.live && i.reason === '게시 기간 종료됨').length;

  return (
    <div>
      <PageHeader
        eyebrow="PUBLIC POPUPS"
        title="공개 팝업"
        sub="로그인하지 않은 방문자에게도 노출됩니다. 여러 개를 동시에 띄울 수 있고, 방문자는 하나씩 넘겨 봅니다."
      />

      {liveCount >= 3 && (
        <div className="mb-5">
          <Callout tone="warn" title={`동시에 ${liveCount}개가 노출 중입니다`}>
            방문자는 접속할 때마다 {liveCount}개를 차례로 닫아야 합니다. 게시 기간을 나누거나 우선순위가 낮은 것을
            내리는 편이 좋습니다.
          </Callout>
        </div>
      )}

      <div className="mb-6">
        <StatGrid
          stats={[
            { label: '현재 노출', value: liveCount, warn: liveCount >= 3 },
            { label: '게시 예정', value: scheduled },
            { label: '기간 종료', value: expired },
            { label: '전체', value: items.length },
          ]}
        />
      </div>

      <SectionHeader title="새 팝업" sub="포스터 이미지와 이동 버튼(커뮤니티 글·외부 링크·문의 메일)을 붙일 수 있습니다." />
      <div className="mb-10">
        <PopupEditor />
      </div>

      <SectionHeader title={`등록된 팝업 (${items.length})`} />
      <PopupList items={items} />
    </div>
  );
}
