import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { getSetting } from '@/app/lib/settings';
import { resolvePopupLink } from '@/app/lib/popups';
import BannerPopupButton from './banner-popup-button';

// 전역 안내 배너 — 콘솔 › 시스템 › 런타임 설정에서 문구를 넣으면 상단에 한 줄이 뜬다.
//
// 공지 팝업(Announcement)과 목적이 다르다. 팝업은 한 번 읽고 닫는 소식이고, 이건
// "지금 이런 상황입니다"를 계속 붙여 두는 자리다 — 부분 장애 안내처럼 닫히면 안 되는 것.
// 재배포 없이 켜고 끌 수 있어야 하므로 설정 값으로 뒀다.
//
// 버튼을 붙일 수 있게 한 이유: 안내만으로 끝나면 이용자가 "그래서 어디로 가야 하나"를
// 다시 찾아야 한다. 커뮤니티 공지글·외부 링크·문의 메일·팝업 열기로 바로 연결한다.
const TONE_CLASS: Record<string, string> = {
  info: 'bg-sky-600 text-white',
  warn: 'bg-amber-500 text-amber-950',
  alert: 'bg-rose-600 text-white',
};

const BTN_CLASS =
  'shrink-0 rounded-full border border-current/30 bg-white/15 px-3 py-1 text-[11px] font-semibold hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current';

export default async function GlobalBanner() {
  const [text, tone, actionType, actionTarget, actionLabel] = await Promise.all([
    getSetting<string>('content.banner_text'),
    getSetting<string>('content.banner_tone'),
    getSetting<string>('content.banner_action_type'),
    getSetting<string>('content.banner_action_target'),
    getSetting<string>('content.banner_action_label'),
  ]);
  if (!text.trim()) return null;

  const cls = TONE_CLASS[tone] ?? TONE_CLASS.info;

  // 팝업 열기는 다른 동작들과 성격이 다르다 — 이동이 아니라 이 화면에서 모달을 띄운다.
  // 그래서 링크가 아니라 클라이언트 컴포넌트로 처리하고, 내용은 서버에서 미리 실어 보낸다.
  if (actionType === 'popup' && actionTarget.trim()) {
    const popup = await prisma.announcement
      .findUnique({
        where: { id: actionTarget.trim() },
        select: { id: true, title: true, content: true, imageUrl: true, variant: true, linkType: true, linkTarget: true, linkLabel: true },
      })
      .catch(() => null);

    if (popup) {
      return (
        <div role="status" className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-center text-xs font-medium leading-relaxed ${cls}`}>
          <span>{text}</span>
          <BannerPopupButton popup={popup} label={actionLabel.trim() || '자세히 보기'} className={BTN_CLASS} />
        </div>
      );
    }
    // 지정한 팝업이 지워졌으면 버튼 없이 문구만 — 깨진 버튼을 그리지 않는다
  }

  const link =
    actionType === 'popup' ? null : resolvePopupLink(actionType, actionTarget, actionLabel);

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-center text-xs font-medium leading-relaxed ${cls}`}
    >
      <span>{text}</span>
      {link &&
        (link.external ? (
          <a href={link.href} target="_blank" rel="noreferrer noopener" className={BTN_CLASS}>
            {link.label} ↗
          </a>
        ) : (
          <Link href={link.href} className={BTN_CLASS}>
            {link.label} →
          </Link>
        ))}
    </div>
  );
}
