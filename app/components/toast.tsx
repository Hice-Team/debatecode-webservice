'use client';

// 떠 있는 알림(토스트) 껍데기.
//
// "됐다"를 알리는 자리는 화면마다 다르지만(복사는 입력창 위, 접수는 우측 상단),
// 공통으로 필요한 것은 늘 같다 — body로 포털해서 쌓임 맥락에 갇히지 않기,
// 스크린리더에 알리기, 들어오고 나가는 짧은 움직임.
// 그 셋만 여기서 맡고 내용은 부르는 쪽이 정한다.
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/** 바뀔 일이 없는 값을 useSyncExternalStore로 읽을 때의 빈 구독 */
const subscribeNever = () => () => {};

export type ToastPlacement =
  /** 화면 우측 상단 — 지금 하던 일과 상관없이 알리기만 하면 되는 것 */
  | 'top-right'
  /** 입력창 바로 위 가운데 — 방금 누른 버튼 근처에서 말해야 하는 것 */
  | 'above-composer';

const PLACEMENT: Record<ToastPlacement, string> = {
  'top-right': 'right-4 top-20 animate-in fade-in slide-in-from-top-2',
  // 컴포저는 화면 아래 고정이고 높이가 입력에 따라 달라진다.
  // 넉넉히 띄워 두 요소가 겹치지 않게 한다(컴포저 자리는 pb-40 sm:pb-44).
  'above-composer':
    'bottom-[11.5rem] sm:bottom-[12.5rem] left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2',
};

export default function Toast({
  open,
  placement = 'top-right',
  children,
}: {
  open: boolean;
  placement?: ToastPlacement;
  children: React.ReactNode;
}) {
  // 포털은 브라우저에만 있다 — 서버 스냅샷을 false로 두면 하이드레이션이 어긋나지 않는다.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed z-[95] flex items-start gap-2.5 rounded-[var(--radius-panel)] border border-hairline bg-surface px-4 py-3 shadow-[0_12px_32px_rgba(8,9,26,0.18)] duration-200 ${PLACEMENT[placement]}`}
    >
      {children}
    </div>,
    document.body,
  );
}
