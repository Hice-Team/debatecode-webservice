'use client';

// 확인창 껍데기 — 열림/닫힘과 초점만 맡고 내용은 부르는 쪽이 정한다.
//
// 화면마다 fixed inset-0 을 새로 적어 왔는데, 그때마다 빠지는 것이 늘 같았다.
// Esc로 닫히지 않거나, 닫은 뒤 초점이 문서 맨 위로 튀거나, 뒤 배경이 계속 스크롤되거나,
// z 값이 헤더와 같아서 가려지거나. 그 넷을 여기서 한 번만 해결한다.
//
// body로 포털한다 — 설정 화면의 sticky 사이드바처럼 backdrop-filter나 transform이 걸린
// 조상이 있으면 그 안에서는 fixed가 뷰포트가 아니라 그 조상을 기준으로 잡힌다.
import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const subscribeNever = () => () => {};

export default function Dialog({
  open,
  onClose,
  title,
  desc,
  children,
  footer,
  /** 위험한 작업(삭제 등)이면 제목 옆에 붉은 표식을 둔다 */
  tone = 'default',
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: 'default' | 'danger';
  width?: 'sm' | 'md' | 'lg';
}) {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 열기 직전에 초점이 있던 곳 — 닫으면 여기로 돌려보낸다
  const returnTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;

    // 뒤 배경이 따라 스크롤되면 확인창이 화면 밖으로 밀려난다
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 초점을 안으로 들여보낸다 — 첫 조작 요소, 없으면 패널 자체
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panelRef.current)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      // Tab 순환 — 확인창 밖으로 초점이 새어 나가면 뒤 화면을 조작하게 된다
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus?.();
    };
  }, [open, close]);

  if (!open || !mounted) return null;

  const maxWidth = width === 'sm' ? 'max-w-sm' : width === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-ink/45 p-4 sm:items-center"
      onMouseDown={(e) => {
        // 배경을 눌러 닫는다. mousedown 기준이라 패널 안에서 드래그해 나와도 닫히지 않는다.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-dialog-title"
        tabIndex={-1}
        className={`w-full ${maxWidth} rounded-[var(--radius-panel)] border border-hairline bg-surface p-5 shadow-[0_12px_32px_rgba(8,9,26,0.24)] outline-none sm:p-6`}
      >
        <div className="flex items-start gap-3">
          {tone === 'danger' && (
            <span
              aria-hidden
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                <path d="M12 8.5v5M12 16.5h.01" strokeLinecap="round" />
                <circle cx="12" cy="12" r="8.5" />
              </svg>
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="dc-dialog-title" className="font-display text-base font-bold tracking-tight text-fg">
              {title}
            </h2>
            {desc && <div className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">{desc}</div>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="dc-tap -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-quiet transition-colors hover:bg-paper hover:text-fg"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden>
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
