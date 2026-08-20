'use client';

// AI Search 진입 — 알약형 검색바. 제출하면 /study/search 결과 페이지로 넘어간다.
// 첨부 메뉴·음성 입력은 대화 화면의 컴포저와 같은 컴포넌트를 쓴다(동작이 갈리지 않도록).
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import ModelPicker from './search/model-picker';
import AttachMenu from './search/attach-menu';
import AttachmentChips from './search/attachment-chips';
import { VoiceButton, VoiceConsentDialog, VoiceWaveform, useVoiceInput } from './search/voice-input';
import { voiceConsentStrings } from './search/voice-strings';
import { DEFAULT_SEARCH_MODEL_ID } from '@/app/lib/ai/search-models';
import { PENDING_ATTACHMENTS_KEY, toWireAttachment, type PendingAttachment } from './search/pending-attachments';
import { DEFAULT_EFFORT, type Effort } from '@/app/lib/ai/effort';

export default function AiSearch({ liveModel, authed }: { liveModel: boolean; authed: boolean }) {
  const { language } = useLanguage();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [model, setModel] = useState(DEFAULT_SEARCH_MODEL_ID);
  const [effort, setEffort] = useState<Effort>(DEFAULT_EFFORT);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 받아쓰기 결과는 검색어에 이어 붙인다 — 말한 뒤 손으로 고칠 수 있게
  const appendSpoken = useCallback((spoken: string) => {
    setQuery((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${spoken}` : spoken));
  }, []);
  const voice = useVoiceInput({ lang: language === 'en' ? 'en-US' : 'ko-KR', onCommit: appendSpoken });

  function submit() {
    const q = query.trim();
    if (!q || busy) return;
    if (voice.listening) voice.stop();
    // 비로그인 상태에서는 대화를 만들 수 없다 — 질문을 들고 로그인으로 보낸다
    if (!authed) {
      router.push('/login');
      return;
    }
    // 첨부는 URL에 담기엔 길어서 sessionStorage로 넘기고, 대화 화면이 첫 질문에 붙인다
    if (attachments.length > 0) {
      try {
        window.sessionStorage.setItem(PENDING_ATTACHMENTS_KEY, JSON.stringify(attachments.map(toWireAttachment)));
      } catch {
        // 저장 실패 시 첨부 없이 진행한다
      }
    }
    router.push(`/study/search?q=${encodeURIComponent(q)}&model=${model}&effort=${effort}`);
  }

  return (
    <section className="mb-14" aria-labelledby="ai-search-title">
      <div className="relative rounded-[var(--radius-panel)] px-3 pb-8 pt-9 sm:px-8 sm:pb-10 sm:pt-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-[var(--radius-panel)]"
          style={{
            background:
              'linear-gradient(180deg, rgba(238,240,255,0.95) 0%, rgba(247,248,255,0.6) 55%, rgba(255,255,255,0) 100%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-6 -z-10 h-56 w-[min(46rem,100%)] -translate-x-1/2 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(40% 60% at 28% 50%, rgba(91,76,240,0.30), transparent 70%), radial-gradient(44% 68% at 72% 46%, rgba(24,0,172,0.22), transparent 72%)',
          }}
        />

        <h2
          id="ai-search-title"
          className="text-center font-display text-2xl font-medium tracking-tight text-ink sm:text-[1.75rem]"
        >
          {t('ai-search-title', language)}
        </h2>
        <p className="mt-2 text-center text-sm text-fg-muted">{t('ai-search-desc', language)}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mx-auto mt-7 w-full max-w-3xl"
        >
          {/* 넓은 화면은 알약 한 줄, 폰은 입력 아래로 컨트롤이 내려간다(둥근 모서리도 함께 완화) */}
          <div className="flex flex-wrap items-center gap-0.5 rounded-[var(--radius-panel)] border border-hairline bg-white p-1.5 sm:flex-nowrap sm:gap-1 sm:rounded-full sm:py-2 sm:pl-3 sm:pr-2 shadow-[0_2px_10px_rgba(24,0,172,0.06),0_10px_36px_rgba(24,0,172,0.10)] transition focus-within:shadow-[0_2px_12px_rgba(24,0,172,0.10),0_14px_44px_rgba(24,0,172,0.16)]">
            <AttachMenu
              placement="bottom"
              // 첨부는 업로드 API가 로그인을 요구한다 — 눌러 보고 실패하게 두지 않는다
              disabled={!authed}
              onNotice={setNotice}
              onBusyChange={setBusy}
              onAdd={(files) => setAttachments((prev) => [...prev, ...files])}
            />

            {/* 듣는 중에는 입력 자리를 파형이 대신한다 */}
            {voice.listening ? (
              <VoiceWaveform
                analyser={voice.analyser}
                transcript={query}
                interim={voice.interim}
                placeholder={t('ai-voice-listening', language)}
              />
            ) : (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // 한글 입력 중(조합 중) Enter는 글자 확정이지 전송이 아니다
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={t('ai-search-placeholder', language)}
                aria-label={t('ai-search-title', language)}
                className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[15px] text-ink placeholder:text-fg-quiet focus:outline-none"
              />
            )}

            {/* 모델 · 음성 · 검색 — 폰에서는 이 묶음이 통째로 아랫줄로 내려간다 */}
            <div className="flex w-full items-center gap-0.5 sm:w-auto sm:gap-1">
              {/* 강도(Effort)는 이 메뉴 안에 함께 들어 있다 */}
              <ModelPicker
                value={model}
                onChange={setModel}
                effort={effort}
                onEffortChange={setEffort}
                live={liveModel}
                placement="bottom"
              />

              {/* 폰에서만 — 검색 버튼을 오른쪽 끝으로 민다 */}
              <span aria-hidden className="flex-1 sm:hidden" />

              <VoiceButton
                listening={voice.listening}
                onClick={voice.toggle}
                disabled={!voice.supported}
                label={t('ai-voice-start', language)}
                stopLabel={t('ai-voice-stop', language)}
              />

              <button
                type="submit"
                disabled={!query.trim() || busy}
                aria-label={t('ai-search-submit', language)}
                title={t('ai-search-submit', language)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-brand-50 hover:text-signal active:scale-95 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.4-3.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <AttachmentChips
            files={attachments}
            onRemove={(index) => setAttachments((prev) => prev.filter((_, i) => i !== index))}
            align="center"
            className="mt-3"
          />

          {(notice || voice.error || busy) && (
            <p className="mt-2 text-center text-[11px] text-fg-muted">
              {busy ? t('ai-attach-uploading', language) : (notice ?? voice.error)}
            </p>
          )}
        </form>
      </div>

      <p className="mx-auto w-full max-w-3xl text-center text-[11px] leading-relaxed text-fg-muted">
        {t('ai-search-disclaimer', language)}
      </p>

      {/* 브라우저 권한 창 전에 한 번 — 음성이 어디로 가는지 밝힌다 */}
      <VoiceConsentDialog
        open={voice.askingConsent}
        onAccept={voice.acceptConsent}
        onDecline={voice.declineConsent}
        permission={voice.permission}
        strings={voiceConsentStrings(language)}
      />
    </section>
  );
}
