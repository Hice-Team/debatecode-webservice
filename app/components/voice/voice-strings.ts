// 마이크 권한 안내에 들어가는 문구 묶음 — 히어로 검색바와 컴포저가 같은 문구를 쓴다.
// (한 곳에서만 고쳐도 두 화면이 함께 바뀌게 하려고 분리했다.)
import { t } from '@/app/lib/i18n';
import type { Language } from '@/app/lib/i18n';

export function voiceConsentStrings(language: Language) {
  return {
    title: t('ai-voice-consent-title', language),
    body: t('ai-voice-consent-body', language),
    browserNote: t('ai-voice-consent-browser', language),
    noStore: t('ai-voice-consent-no-store', language),
    denied: t('ai-voice-consent-denied', language),
    allow: t('ai-voice-consent-allow', language),
    cancel: t('cancel', language),
  };
}
