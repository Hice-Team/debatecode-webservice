'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

interface Props {
  companies: string[];
  years: string[];
  activeCompanies?: string[];
  activeYears?: string[];
  activeQuery?: string;
}

export default function ContestFilters({
  companies,
  years,
  activeCompanies = [],
  activeYears = [],
  activeQuery,
}: Props) {
  const { language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(activeQuery ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCount = activeCompanies.length + activeYears.length;

  function toggle(key: 'company' | 'year', value: string) {
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
    router.push(`/contests?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('page');
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      router.push(`/contests?${params.toString()}`);
    }, 350);
  }

  function resetFilters() {
    const params = new URLSearchParams(searchParams.toString());
    ['company', 'year', 'q', 'page'].forEach((key) => params.delete(key));
    setQ('');
    router.push(`/contests?${params.toString()}`);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // py-2.5 — 칩이 나란히 붙어 있어 투명 판(dc-tap)을 쓰면 서로의 영역을 먹는다.
// 실제 높이를 44px에 맞춘다.
const chipBase =
  'px-3.5 py-2.5 rounded-full border text-xs font-medium transition-colors cursor-pointer';
  const on = 'bg-brand-50 text-brand-700 border-brand-300 shadow-[inset_0_0_0_1px_rgba(69,49,217,0.15)]';
  const off = 'bg-surface text-fg-secondary border-hairline hover:border-brand-300 hover:text-signal';
  const groupLabel = 'font-mono text-[10px] uppercase tracking-wider text-fg-quiet w-20 shrink-0 pt-1.5';

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface shadow-[0_1px_2px_rgba(20,21,43,0.04)]">
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
            placeholder={t('search-contests-placeholder', language)}
            className="w-full rounded-[var(--radius-card)] border border-hairline bg-paper px-4 py-3 pl-10 text-sm placeholder:text-fg-quiet focus:border-signal focus:bg-surface focus:outline-none focus:ring-2 focus:ring-signal/25"
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

      {showFilters && (
        <div className="space-y-3 border-t border-hairline bg-paper/50 p-4">
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
          {years.length > 0 && (
            <div className="flex flex-wrap items-start gap-2">
              <span className={groupLabel}>Year</span>
              {years.map((y) => (
                <button key={y} onClick={() => toggle('year', y)} className={`${chipBase} ${activeYears.includes(y) ? on : off}`}>
                  {y}
                </button>
              ))}
            </div>
          )}
          {activeCount > 0 && (
            <div className="flex justify-end border-t border-hairline pt-3">
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
