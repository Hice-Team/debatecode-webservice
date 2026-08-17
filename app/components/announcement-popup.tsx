'use client';

// 전체 공지 팝업 — 웹 접속 시 중앙 모달로 노출.
// "오늘 하루 보지 않기"를 체크하고 닫은 경우에만 24시간 동안 숨기고,
// 그냥 닫으면 다음 페이지 접속(새로고침/재방문) 때 다시 뜬다.
import { useEffect, useState } from 'react';

const HIDE_KEY = 'dc-announcement-hide'; // { id, until } JSON

function hiddenToday(id: string): boolean {
  try {
    const raw = localStorage.getItem(HIDE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { id?: string; until?: number };
    return saved.id === id && typeof saved.until === 'number' && saved.until > Date.now();
  } catch {
    return false;
  }
}

export default function AnnouncementPopup({ id, title, content }: { id: string; title: string; content: string }) {
  const [visible, setVisible] = useState(false);
  const [hideToday, setHideToday] = useState(false);

  useEffect(() => {
    if (!hiddenToday(id)) setVisible(true);
  }, [id]);

  function close() {
    if (hideToday) {
      // 24시간 동안 이 공지를 숨긴다
      localStorage.setItem(HIDE_KEY, JSON.stringify({ id, until: Date.now() + 24 * 3600 * 1000 }));
    }
    setVisible(false); // 체크하지 않으면 저장하지 않음 — 다음 접속 시 다시 노출
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="presentation">
      {/* 배경 딤 — 클릭 시 (하루 숨김 없이) 닫기 */}
      <div aria-hidden className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-notice-title"
        className="relative w-[min(28rem,100%)] overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/30 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="bg-brand-900 px-6 py-4 text-white">
          <p className="font-mono text-[10px] tracking-wider text-brand-300">NOTICE</p>
          <h3 id="dc-notice-title" className="mt-0.5 text-lg font-bold leading-snug">{title}</h3>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-6 py-5">
          <p className="text-sm text-ink-soft/80 leading-relaxed whitespace-pre-line">{content}</p>
        </div>
        <div className="flex items-center gap-3 border-t border-ink/10 bg-paper/60 px-6 py-3.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft/70">
            <input
              type="checkbox"
              checked={hideToday}
              onChange={(e) => setHideToday(e.target.checked)}
              className="h-4 w-4 accent-[#1800AC]"
            />
            오늘 하루 보지 않기
          </label>
          <button
            type="button"
            onClick={close}
            className="ml-auto rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
