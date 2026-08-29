'use client';

// 공개 팝업 — 접속 시 중앙 모달로 노출. 로그인 여부와 무관하게 뜬다.
//
// 여러 개가 동시에 Live일 수 있다. 한꺼번에 겹쳐 띄우면 아무것도 안 읽히므로
// 한 번에 하나씩 보여 주고 "다음"으로 넘긴다 — 개수는 상단에 표시한다.
//
// "오늘 하루 보지 않기"는 팝업 단위로 기억한다. 예전에는 키가 하나뿐이라
// 새 팝업을 올리면 이전에 숨긴 기록이 덮여 버렸다.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

const HIDE_KEY = 'dc-popup-hidden'; // { [id]: until(ms) }

export interface PopupItem {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  variant: string;
  linkType: string;
  linkTarget: string | null;
  linkLabel: string | null;
}

/** 링크 해석 — 서버(app/lib/popups.ts)와 같은 규칙. 클라이언트 번들에 서버 모듈을 끌어오지 않으려고 옮겨 적었다. */
function resolveLink(item: PopupItem): { href: string; label: string; external: boolean } | null {
  const value = (item.linkTarget ?? '').trim();
  if (item.linkType === 'none' || !value) return null;
  const fallback = { post: '자세히 보기', url: '바로가기', mail: '문의하기' }[item.linkType] ?? '바로가기';
  const label = (item.linkLabel ?? '').trim() || fallback;

  if (item.linkType === 'post') {
    const id = value.includes('/') ? value.replace(/\/+$/, '').split('/').pop()! : value;
    return { href: `/community/${id}`, label, external: false };
  }
  if (item.linkType === 'mail') {
    return value.includes('@') ? { href: `mailto:${value}`, label, external: true } : null;
  }
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { href: url.toString(), label, external: true };
  } catch {
    return null;
  }
}

/* ---------- 숨김 상태 (localStorage) ---------- */

// 스냅샷은 같은 값이면 같은 문자열이어야 한다 — 매번 새 객체를 만들면 무한 렌더가 된다.
let hiddenSnapshot = '{}';

function readHiddenRaw(): string {
  try {
    hiddenSnapshot = window.localStorage.getItem(HIDE_KEY) ?? '{}';
  } catch {
    // 저장소를 못 읽으면 아무것도 숨기지 않은 것으로 본다
  }
  return hiddenSnapshot;
}

// 서버에는 localStorage가 없다. 서버 스냅샷을 따로 주면 React가 하이드레이션 불일치 없이
// "서버는 빈 값 → 마운트 후 실제 값"으로 전환해 준다. useEffect + setState보다 안전하다.
function serverHidden(): string {
  return '{}';
}

function subscribeHidden(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function parseHidden(raw: string): Record<string, number> {
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export default function AnnouncementPopup({
  items,
  onAllClosed,
}: {
  items: PopupItem[];
  /** 배너에서 수동으로 연 경우, 다 닫으면 부모가 버튼 상태를 되돌릴 수 있게 알린다 */
  onAllClosed?: () => void;
}) {
  const hiddenRaw = useSyncExternalStore(subscribeHidden, readHiddenRaw, serverHidden);
  const [index, setIndex] = useState(0);
  const [hideToday, setHideToday] = useState(false);
  // 이번 세션에서 사용자가 닫은 팝업 — 저장소와 별개로 화면에서만 치운다
  const [dismissed, setDismissed] = useState<string[]>([]);

  const queue = useMemo(() => {
    const hidden = parseHidden(hiddenRaw);
    const now = new Date().getTime();
    return items.filter((i) => !(hidden[i.id] > now) && !dismissed.includes(i.id));
  }, [items, hiddenRaw, dismissed]);

  if (queue.length === 0) return null;
  const item = queue[Math.min(index, queue.length - 1)];
  if (!item) return null;

  const link = resolveLink(item);
  const isPoster = item.variant === 'poster' && item.imageUrl;

  function close() {
    if (hideToday) {
      const hidden = parseHidden(hiddenRaw);
      hidden[item.id] = new Date().getTime() + 24 * 3600 * 1000;
      try {
        window.localStorage.setItem(HIDE_KEY, JSON.stringify(hidden));
      } catch {
        // 저장에 실패해도 닫히기는 해야 한다
      }
    }
    setHideToday(false);
    const next = [...dismissed, item.id];
    setDismissed(next);
    setIndex(0);
    if (queue.length <= 1) onAllClosed?.();
  }

  return (
    <PopupShell onClose={close}>
      <div aria-hidden className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-notice-title"
        className="relative flex max-h-[calc(100dvh-2rem)] w-[min(30rem,100%)] flex-col overflow-hidden rounded-[var(--radius-panel)] bg-surface shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200"
      >
        {/* 닫기 — 예전에는 배경을 눌러야만 닫혔다. 배경 클릭은 알아채기 어려운 조작이고,
            포스터가 화면을 꽉 채우면 누를 배경 자체가 거의 없다. */}
        <button
          type="button"
          onClick={close}
          aria-label="공지 닫기"
          className="dc-tap absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-ink/45 text-white backdrop-blur transition-colors hover:bg-ink/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2]" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
        {/* 여러 건일 때 몇 번째인지 — 닫아도 또 뜨는 이유를 알 수 있게 */}
        {queue.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5 bg-paper px-6 py-1.5 pr-14">
            <span className="dc-num font-mono text-[10px] text-fg-muted">
              공지 {index + 1} / {queue.length}
            </span>
            {/* 점은 표시가 아니라 조작이다 — 놓친 공지로 되돌아갈 길이 있어야 한다 */}
            <div className="ml-auto flex gap-1">
              {queue.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`${i + 1}번째 공지 보기`}
                  aria-current={i === index}
                  className="dc-tap grid h-5 w-5 place-items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                >
                  <span
                    aria-hidden
                    className={`h-1 w-4 rounded-full transition-colors ${i === index ? 'bg-brand-600' : 'bg-fg-quiet/40'}`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 포스터 이미지 */}
        {item.imageUrl && (
          // 외부 Storage URL이라 next/image 최적화를 태우지 않는다(도메인 화이트리스트 불필요)
           
          <img
            src={item.imageUrl}
            alt={item.title}
            className={`w-full shrink-0 object-cover ${isPoster ? 'max-h-[55dvh] object-contain bg-paper' : 'h-40'}`}
          />
        )}

        {!isPoster && (
          <div className="shrink-0 bg-brand-900 px-6 py-4 pr-14 text-white">
            <p className="font-mono text-[10px] tracking-wider text-brand-300">NOTICE</p>
            <h3 id="dc-notice-title" className="mt-0.5 text-lg font-bold leading-snug">
              {item.title}
            </h3>
          </div>
        )}

        {(isPoster || item.content) && (
          <div className="dc-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {isPoster && (
              <h3 id="dc-notice-title" className="mb-2 text-lg font-bold leading-snug text-fg">
                {item.title}
              </h3>
            )}
            {item.content && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg">{item.content}</p>
            )}
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-hairline bg-paper/60 px-6 py-3.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-secondary">
            <input
              type="checkbox"
              checked={hideToday}
              onChange={(e) => setHideToday(e.target.checked)}
              className="h-4 w-4 accent-[#1800AC]"
            />
            오늘 하루 보지 않기
          </label>

          <div className="ml-auto flex items-center gap-2">
            {link && (
              <a
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                onClick={close}
                className="rounded-lg border border-brand-300 bg-surface px-4 py-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                {link.label} {link.external ? '↗' : '→'}
              </a>
            )}
            <button
              type="button"
              onClick={close}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              {index < queue.length - 1 ? '다음' : '닫기'}
            </button>
          </div>
        </div>
      </div>
    </PopupShell>
  );
}

/**
 * 공지 창의 껍데기 — Esc로 닫히고, 열려 있는 동안 뒤 배경이 스크롤되지 않는다.
 *
 * 팝업은 페이지가 뜨자마자 초점을 가져가는 유일한 창이라 빠져나갈 길이 분명해야 한다.
 * 예전에는 배경 클릭 하나뿐이었고, 포스터가 화면을 채우면 그 배경조차 거의 없었다.
 */
function PopupShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div ref={ref} className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
      {children}
    </div>
  );
}
