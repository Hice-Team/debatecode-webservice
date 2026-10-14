'use client';

import { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { getEffectiveTheme, readTheme, subscribeTheme, toggleTheme, type ThemeChoice } from '@/app/lib/theme';
import { SUPPORTED_LANGUAGES, type Language } from '@/app/lib/i18n';

interface CommandItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette() {
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const choice = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as ThemeChoice);
  const effectiveTheme = getEffectiveTheme(choice);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K 단축키 리스너
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 커맨드 목록 구성
  const commands: CommandItem[] = [
    // 네비게이션
    {
      id: 'nav-problems',
      category: language === 'ko' ? '페이지 이동' : 'Navigation',
      title: language === 'ko' ? '문제집 (Problems)' : 'Problems Library',
      subtitle: '/problems',
      action: () => { router.push('/problems'); setOpen(false); },
    },
    {
      id: 'nav-contests',
      category: language === 'ko' ? '페이지 이동' : 'Navigation',
      title: language === 'ko' ? '코딩테스트 (Coding Tests)' : 'Coding Tests & Mock Exams',
      subtitle: '/contests',
      action: () => { router.push('/contests'); setOpen(false); },
    },
    {
      id: 'nav-study',
      category: language === 'ko' ? '페이지 이동' : 'Navigation',
      title: language === 'ko' ? '학습 교재 (Study)' : 'Study & Curriculum',
      subtitle: '/study',
      action: () => { router.push('/study'); setOpen(false); },
    },
    {
      id: 'nav-community',
      category: language === 'ko' ? '페이지 이동' : 'Navigation',
      title: language === 'ko' ? '커뮤니티 (Community)' : 'Developer Community',
      subtitle: '/community',
      action: () => { router.push('/community'); setOpen(false); },
    },
    {
      id: 'nav-dashboard',
      category: language === 'ko' ? '페이지 이동' : 'Navigation',
      title: language === 'ko' ? '대시보드 (Dashboard)' : 'User Dashboard',
      subtitle: '/dashboard',
      action: () => { router.push('/dashboard'); setOpen(false); },
    },
    {
      id: 'nav-settings',
      category: language === 'ko' ? '페이지 이동' : 'Navigation',
      title: language === 'ko' ? '설정 (Settings)' : 'Application Settings',
      subtitle: '/settings',
      action: () => { router.push('/settings'); setOpen(false); },
    },
    // 테마 토글
    {
      id: 'action-theme-toggle',
      category: language === 'ko' ? '환경 설정' : 'Preferences',
      title: effectiveTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환',
      subtitle: effectiveTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      action: () => {
        toggleTheme();
        setOpen(false);
      },
    },
    // 언어 전환
    ...SUPPORTED_LANGUAGES.map((lang) => ({
      id: `lang-${lang.code}`,
      category: language === 'ko' ? '언어 변경' : 'Language',
      title: `${lang.label} (${lang.nativeLabel})`,
      subtitle: lang.code === language ? '✓ 현재 선택됨 (Active)' : undefined,
      action: () => {
        setLanguage(lang.code);
        setOpen(false);
      },
    })),
  ];

  // 쿼리 필터링
  const filtered = commands.filter((c) => {
    if (!query.trim()) return true;
    const lower = query.toLowerCase();
    return (
      c.title.toLowerCase().includes(lower) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(lower)) ||
      c.category.toLowerCase().includes(lower)
    );
  });

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-20 bg-ink/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius-panel)] border border-brand-200 bg-surface shadow-[0_24px_64px_-16px_rgba(20,21,43,0.35)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 상단 검색 인풋 */}
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-fg-quiet fill-none stroke-current stroke-2" aria-hidden>
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.2-4.2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={
              language === 'ko'
                ? '명령어 검색, 페이지 이동, 언어 또는 테마 설정…'
                : 'Type a command, page name, or language…'
            }
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-quiet focus:outline-none"
          />
          <kbd className="hidden sm:inline-block rounded border border-hairline bg-paper px-2 py-0.5 font-mono text-[10px] text-fg-muted">
            ESC
          </kbd>
        </div>

        {/* 결과 리스트 */}
        <div className="max-h-[360px] overflow-y-auto dc-scroll p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-fg-quiet">
              {language === 'ko' ? '검색 결과가 없습니다.' : 'No commands found.'}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const selected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs transition-colors ${
                    selected ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-fg-secondary hover:bg-paper'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0 font-mono text-[10px] uppercase text-fg-quiet">
                      {item.category}
                    </span>
                    <span className="truncate text-fg">{item.title}</span>
                  </div>
                  {item.subtitle && (
                    <span className="shrink-0 font-mono text-[11px] text-fg-quiet ml-2">
                      {item.subtitle}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 하단 단축키 힌트 풋터 */}
        <div className="flex items-center justify-between border-t border-hairline bg-paper/50 px-4 py-2.5 font-mono text-[11px] text-fg-quiet">
          <div className="flex items-center gap-3">
            <span>↑↓ {language === 'ko' ? '이동' : 'Navigate'}</span>
            <span>↵ {language === 'ko' ? '선택' : 'Select'}</span>
          </div>
          <span>Debate Code Command</span>
        </div>
      </div>
    </div>
  );
}
