'use client';

import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

export default function SkipToContent() {
  const { language } = useLanguage();

  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2.5 focus:rounded-full focus:bg-signal focus:text-white focus:font-semibold focus:shadow-xl focus:outline-none focus:ring-4 focus:ring-signal/30 transition-transform"
    >
      {t('skip-to-content', language)}
    </a>
  );
}
