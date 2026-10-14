'use client';

import { useLanguage } from '@/app/context/language-context';
import { translateCategory, translateCompany } from '@/app/lib/i18n';

export function I18nCategorySlot({ category }: { category: string }) {
  const { language } = useLanguage();
  return <>{translateCategory(category, language)}</>;
}

export function I18nCompanySlot({ company }: { company: string | null | undefined }) {
  const { language } = useLanguage();
  if (!company) return null;
  return <>{translateCompany(company, language)}</>;
}
