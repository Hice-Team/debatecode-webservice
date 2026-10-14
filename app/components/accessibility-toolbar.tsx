'use client';

import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/app/context/language-context';
import type { Language } from '@/app/lib/i18n';

type FontScale = 'normal' | 'large' | 'xlarge';

const A11Y_COPY: Record<Language, {
  title: string;
  triggerLabel: string;
  fontSizeTitle: string;
  normal: string;
  large: string;
  xlarge: string;
  highContrastTitle: string;
  highContrastDesc: string;
  reduceMotionTitle: string;
  reduceMotionDesc: string;
  close: string;
  reset: string;
}> = {
  ko: {
    title: '베리어프리 · 접근성 설정',
    triggerLabel: '접근성 및 편의 도구 열기',
    fontSizeTitle: '글자 크기 조절',
    normal: '기본 (100%)',
    large: '크게 (115%)',
    xlarge: '아주 크게 (130%)',
    highContrastTitle: '고대비 모드 (High Contrast)',
    highContrastDesc: '텍스트와 경계선의 명암비를 극대화하여 또렷하게 표시합니다.',
    reduceMotionTitle: '모션 줄이기 (Reduce Motion)',
    reduceMotionDesc: '깜빡임 및 불필요한 시각적 전환 애니메이션을 끕니다.',
    close: '닫기',
    reset: '기본값 복원',
  },
  en: {
    title: 'Accessibility & Barrier-Free Settings',
    triggerLabel: 'Open accessibility toolbar',
    fontSizeTitle: 'Text Size Scaling',
    normal: 'Default (100%)',
    large: 'Large (115%)',
    xlarge: 'Extra Large (130%)',
    highContrastTitle: 'High Contrast Mode',
    highContrastDesc: 'Maximizes contrast between text and borders for clearer visibility.',
    reduceMotionTitle: 'Reduce Motion',
    reduceMotionDesc: 'Disables flickering and transitional motion effects.',
    close: 'Close',
    reset: 'Reset to default',
  },
  ja: {
    title: 'バリアフリー・アクセシビリティ設定',
    triggerLabel: 'アクセシビリティツールを開く',
    fontSizeTitle: '文字サイズ調整',
    normal: '標準 (100%)',
    large: '拡大 (115%)',
    xlarge: '最大 (130%)',
    highContrastTitle: 'ハイコントラストモード',
    highContrastDesc: '文字と境界線の明暗比を高め、くっきりと視認性を向上させます。',
    reduceMotionTitle: 'アニメーション削減',
    reduceMotionDesc: '画面の揺れやちらつき等の動きを最小限に抑えます。',
    close: '閉じる',
    reset: '初期設定に戻す',
  },
  'zh-CN': {
    title: '无障碍辅助 · 易用性设置',
    triggerLabel: '打开无障碍辅助工具栏',
    fontSizeTitle: '字号缩放调节',
    normal: '标准 (100%)',
    large: '放大 (115%)',
    xlarge: '超大 (130%)',
    highContrastTitle: '高对比度模式 (High Contrast)',
    highContrastDesc: '大幅提升文本与边界线条的明暗反差，增强清晰辨识度。',
    reduceMotionTitle: '减弱动态效果 (Reduce Motion)',
    reduceMotionDesc: '关闭闪烁与多余的过渡动效，缓解视觉疲劳。',
    close: '关闭',
    reset: '恢复默认设置',
  },
  'zh-TW': {
    title: '無障礙輔助 · 易用性設定',
    triggerLabel: '開啟無障礙輔助工具列',
    fontSizeTitle: '字級縮放調整',
    normal: '預設 (100%)',
    large: '放大 (115%)',
    xlarge: '超大 (130%)',
    highContrastTitle: '高對比模式 (High Contrast)',
    highContrastDesc: '大幅提升文字與邊框線條的明暗對比，增強閱讀清晰度。',
    reduceMotionTitle: '減少動態效果 (Reduce Motion)',
    reduceMotionDesc: '關閉閃爍與多餘的轉場動畫，減緩視覺疲勞。',
    close: '關閉',
    reset: '恢復預設值',
  },
};

export default function AccessibilityToolbar() {
  const { language } = useLanguage();
  const c = A11Y_COPY[language] ?? A11Y_COPY.ko;

  const [open, setOpen] = useState(false);
  const [fontScale, setFontScale] = useState<FontScale>('normal');
  const [highContrast, setHighContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 로컬스토리지에서 기존 설정 불러와 html 태그에 적용
  useEffect(() => {
    try {
      const savedScale = (localStorage.getItem('dc_font_scale') as FontScale) || 'normal';
      const savedContrast = localStorage.getItem('dc-high-contrast') === 'on' || localStorage.getItem('dc_high_contrast') === 'true';
      const savedMotion = localStorage.getItem('dc-reduce-motion') === 'on' || localStorage.getItem('dc_reduce_motion') === 'true';

      setFontScale(savedScale);
      setHighContrast(savedContrast);
      setReduceMotion(savedMotion);

      applyFontScale(savedScale);
      applyHighContrast(savedContrast);
      applyReduceMotion(savedMotion);
    } catch {
      /* ignore */
    }
  }, []);

  function applyFontScale(scale: FontScale) {
    const root = document.documentElement;
    if (scale === 'large') root.style.fontSize = '17.5px';
    else if (scale === 'xlarge') root.style.fontSize = '19px';
    else root.style.fontSize = '';
  }

  function applyHighContrast(enabled: boolean) {
    const root = document.documentElement;
    if (enabled) {
      root.classList.add('high-contrast');
      root.dataset.contrast = 'high';
    } else {
      root.classList.remove('high-contrast');
      delete root.dataset.contrast;
    }
  }

  function applyReduceMotion(enabled: boolean) {
    const root = document.documentElement;
    if (enabled) {
      root.classList.add('reduce-motion');
      root.dataset.reduceMotion = 'on';
    } else {
      root.classList.remove('reduce-motion');
      delete root.dataset.reduceMotion;
    }
  }

  function handleScaleChange(scale: FontScale) {
    setFontScale(scale);
    applyFontScale(scale);
    try {
      localStorage.setItem('dc_font_scale', scale);
    } catch {
      /* ignore */
    }
  }

  function handleContrastToggle() {
    const next = !highContrast;
    setHighContrast(next);
    applyHighContrast(next);
    try {
      localStorage.setItem('dc-high-contrast', next ? 'on' : 'off');
      localStorage.setItem('dc_high_contrast', String(next));
    } catch {
      /* ignore */
    }
  }

  function handleMotionToggle() {
    const next = !reduceMotion;
    setReduceMotion(next);
    applyReduceMotion(next);
    try {
      localStorage.setItem('dc-reduce-motion', next ? 'on' : 'off');
      localStorage.setItem('dc_reduce_motion', String(next));
    } catch {
      /* ignore */
    }
  }

  function handleReset() {
    handleScaleChange('normal');
    if (highContrast) handleContrastToggle();
    if (reduceMotion) handleMotionToggle();
  }

  // Escape key & Outside click
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) setOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <>
      {/* 접근성 툴바 진입 플로팅 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={c.triggerLabel}
        aria-expanded={open}
        title={c.title}
        className="fixed bottom-5 left-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface/90 text-fg shadow-[0_4px_16px_rgba(20,21,43,0.12)] backdrop-blur-md transition-all hover:scale-105 hover:border-brand-300 hover:text-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-current stroke-2"
          aria-hidden="true"
        >
          {/* Universal Accessibility Icon */}
          <circle cx="12" cy="4.5" r="2" />
          <path d="M4 8.5h16M12 8.5v7m-3.5 5 3.5-5 3.5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* 접근성 설정 모달 팝업 */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={c.title}
          className="fixed bottom-18 left-5 z-50 w-[320px] max-w-[calc(100vw-40px)] rounded-[var(--radius-panel)] border border-brand-200 bg-surface p-5 shadow-[0_16px_48px_-12px_rgba(20,21,43,0.28)]"
        >
          <div className="flex items-center justify-between border-b border-hairline pb-3 mb-4">
            <h2 className="font-display text-sm font-bold text-fg flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
                A
              </span>
              {c.title}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={c.close}
              className="text-fg-quiet hover:text-fg rounded p-1 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* 글자 크기 조절 */}
            <div>
              <p className="font-mono text-xs font-semibold text-fg-secondary mb-2">
                {c.fontSizeTitle}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(['normal', 'large', 'xlarge'] as FontScale[]).map((scale) => {
                  const active = fontScale === scale;
                  return (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => handleScaleChange(scale)}
                      className={`rounded-lg border py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-brand-400 bg-brand-50 text-brand-700 font-bold'
                          : 'border-hairline bg-paper text-fg-muted hover:border-brand-200 hover:text-fg'
                      }`}
                    >
                      {scale === 'normal' ? '100%' : scale === 'large' ? '115%' : '130%'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 고대비 모드 토글 */}
            <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
              <div>
                <p className="text-xs font-bold text-fg">{c.highContrastTitle}</p>
                <p className="text-[11px] text-fg-muted leading-tight mt-0.5">{c.highContrastDesc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={highContrast}
                onClick={handleContrastToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-signal ${
                  highContrast ? 'bg-signal' : 'bg-fg-quiet/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    highContrast ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 모션 감소 토글 */}
            <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
              <div>
                <p className="text-xs font-bold text-fg">{c.reduceMotionTitle}</p>
                <p className="text-[11px] text-fg-muted leading-tight mt-0.5">{c.reduceMotionDesc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={reduceMotion}
                onClick={handleMotionToggle}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-signal ${
                  reduceMotion ? 'bg-signal' : 'bg-fg-quiet/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    reduceMotion ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 하단 기본값 리셋 */}
            <div className="border-t border-hairline pt-3 flex justify-between items-center text-xs">
              <button
                type="button"
                onClick={handleReset}
                className="text-fg-muted hover:text-signal transition-colors underline underline-offset-2"
              >
                {c.reset}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
              >
                {c.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
