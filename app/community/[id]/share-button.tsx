'use client';

// 게시글 공유 — Web Share API 지원 시 시스템 공유 시트, 아니면 URL 클립보드 복사.
import { useState } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

export default function ShareButton({ title }: { title: string }) {
  const { language } = useLanguage();
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 사용자가 공유 시트를 닫은 경우 등 — 복사로 폴백하지 않고 조용히 종료
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('share-prompt', language), url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full border bg-white px-4 text-sm font-medium transition active:scale-[0.96] ${
        copied ? 'border-emerald-200 text-emerald-600' : 'border-ink/15 text-fg-secondary hover:border-brand-200 hover:text-brand-600'
      }`}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current stroke-[2]" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        // 사슬 고리 — 링크 공유
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.7]" aria-hidden>
          <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7L11.5 6.4" strokeLinecap="round" />
          <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.3-1.3" strokeLinecap="round" />
        </svg>
      )}
      {copied ? t('share-copied', language) : t('share', language)}
    </button>
  );
}
