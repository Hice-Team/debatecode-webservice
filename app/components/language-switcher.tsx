'use client';

// 다국어 선택 드롭다운 — 한국어, English, 日本語, 简体中文, 繁體中文 지원
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { SUPPORTED_LANGUAGES, type Language } from '@/app/lib/i18n';

export default function LanguageSwitcher({
  align = 'right',
  fullWidth = false,
}: {
  align?: 'left' | 'right';
  fullWidth?: boolean;
}) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption = SUPPORTED_LANGUAGES.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open]);

  const handleSelect = (code: Language) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div className={`relative ${fullWidth ? 'w-full' : 'inline-block'}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`언어 선택 / Language: ${currentOption.nativeLabel}`}
        title={`언어 선택 / Language: ${currentOption.nativeLabel}`}
        className={`inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-hairline bg-surface/80 px-2.5 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-brand-300 hover:bg-paper hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal cursor-pointer ${
          fullWidth ? 'w-full justify-between' : ''
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.8] text-fg-muted"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9.5" />
            <path d="M2.5 12h19M12 2.5a15 15 0 0 1 4 9.5 15 15 0 0 1-4 9.5 15 15 0 0 1-4-9.5 15 15 0 0 1 4-9.5Z" />
          </svg>
          <span className="truncate">{currentOption.nativeLabel}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-3 w-3 shrink-0 fill-current text-fg-quiet transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="언어 선택"
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } top-full mt-1.5 w-36 rounded-[var(--radius-panel)] border border-hairline bg-surface p-1 shadow-xl shadow-black/15 z-50 animate-in fade-in zoom-in-95 duration-150`}
        >
          {SUPPORTED_LANGUAGES.map((item) => {
            const isSelected = item.code === language;
            return (
              <button
                key={item.code}
                role="option"
                aria-selected={isSelected}
                type="button"
                onClick={() => handleSelect(item.code)}
                className={`flex w-full items-center justify-between rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-brand-50 font-semibold text-signal'
                    : 'text-fg-secondary hover:bg-paper hover:text-fg'
                }`}
              >
                <span>{item.nativeLabel}</span>
                {isSelected && (
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5 fill-current text-signal"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

