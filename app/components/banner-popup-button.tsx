'use client';

// 배너의 "팝업 열기" 버튼 — 누르면 그 자리에서 공지 팝업을 띄운다.
//
// 자동으로 뜨는 팝업은 닫으면 그만이라, 나중에 다시 보려면 방법이 없었다.
// 배너에 걸어 두면 이용자가 원할 때 다시 열 수 있다.
import { useState } from 'react';
import AnnouncementPopup, { type PopupItem } from './announcement-popup';

export default function BannerPopupButton({
  popup,
  label,
  className,
}: {
  popup: PopupItem;
  label: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {/* key로 매번 새 인스턴스를 만든다 — 닫은 뒤 다시 눌러도 열리게 */}
      {open && <AnnouncementPopup key={String(open)} items={[popup]} onAllClosed={() => setOpen(false)} />}
    </>
  );
}
