'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DIFFICULTY_LABELS, LANGUAGE_LABELS, type Language } from '@/app/lib/types';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

interface Props {
  categories: string[];
  companies: string[];
  activeDifficulties?: number[];
  activeCategories?: string[];
  activeLanguages?: string[];
  activeCompanies?: string[];
  activeQuery?: string;
}

export default function ProblemFilters({
  categories,
  companies,
  activeDifficulties = [],
  activeCategories = [],
  activeLanguages = [],
  activeCompanies = [],
  activeQuery,
}: Props) {
  const { language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(activeQuery ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCount =
    activeDifficulties.length + activeCategories.length + activeLanguages.length + activeCompanies.length;

  function toggle(key: 'difficulty' | 'category' | 'language' | 'company', value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    const current = params.getAll(key);
    if (current.includes(value)) {
      const next = current.filter((item) => item !== value);
      params.delete(key);
      next.forEach((item) => params.append(key, item));
    } else {
      params.append(key, value);
    }
    router.push(`/problems?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('page');
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      router.push(`/problems?${params.toString()}`);
    }, 350);
  }

  function resetFilters() {
    const params = new URLSearchParams(searchParams.toString());
    ['difficulty', 'category', 'language', 'company', 'q', 'page'].forEach((key) => params.delete(key));
    setQ('');
    router.push(`/problems?${params.toString()}`);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const chipBase =
    'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer';
  const on = 'bg-brand-50 text-brand-700 border-brand-300 shadow-[inset_0_0_0_1px_rgba(69,49,217,0.15)]';
  const off = 'bg-white text-fg-secondary border-hairline hover:border-brand-300 hover:text-signal';

  const groupLabel = 'font-mono text-[10px] uppercase tracking-wider text-fg-quiet w-20 shrink-0 pt-1.5';

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white shadow-[0_1px_2px_rgba(20,21,43,0.04)]">
      {/* 검색 + 필터 토글 */}
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-quiet">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-4.2-4.2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t('search-placeholder', language)}
            className="w-full rounded-lg border border-hairline bg-paper px-4 py-2.5 pl-10 text-sm placeholder:text-fg-quiet focus:border-signal/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-signal/30"
          />
        </label>
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
            showFilters || activeCount > 0
              ? 'border-brand-300 bg-brand-50 text-signal'
              : 'border-hairline text-fg-secondary hover:border-brand-300 hover:text-signal'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
            <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
          </svg>
          {t('filter-title', language)}
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-signal px-1 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* 필터 패널 */}
      {showFilters && (
        <div className="space-y-3 border-t border-ink/8 bg-paper/50 p-4">
          <div className="flex flex-wrap items-start gap-2">
            <span className={groupLabel}>Language</span>
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
              <button key={l} onClick={() => toggle('language', l)} className={`${chipBase} ${activeLanguages.includes(l) ? on : off}`}>
                {LANGUAGE_LABELS[l]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <span className={groupLabel}>Level</span>
            {[1, 2, 3, 4].map((d) => (
              <button key={d} onClick={() => toggle('difficulty', String(d))} className={`${chipBase} ${activeDifficulties.includes(d) ? on : off}`}>
                {t(d === 1 ? 'beginner' : d === 2 ? 'easy' : d === 3 ? 'medium' : 'hard', language)}
              </button>
            ))}
          </div>
          {companies.length > 0 && (
            <div className="flex flex-wrap items-start gap-2">
              <span className={groupLabel}>Company</span>
              {companies.map((c) => (
                <button key={c} onClick={() => toggle('company', c)} className={`${chipBase} ${activeCompanies.includes(c) ? on : off}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <span className={groupLabel}>Topic</span>
            {categories.map((c) => (
              <button key={c} onClick={() => toggle('category', c)} className={`${chipBase} ${activeCategories.includes(c) ? on : off}`}>
                {c}
              </button>
            ))}
          </div>
          {activeCount > 0 && (
            <div className="flex justify-end border-t border-ink/8 pt-3">
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1.5 text-sm font-medium text-signal hover:underline">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
                {t('filter-reset', language)} ({activeCount})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
