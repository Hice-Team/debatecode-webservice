'use client';

// AI Search 컴포저 — 알약 입력 안에 [+ 첨부] [입력] [모델] [음성] [전송]을 함께 둔다.
//
// 첨부는 "붙일 수 있는가"와 "모델이 이해하는가"를 분리해 다룬다.
// 파일은 메타데이터로만 보관하고, 실제 내용 해석은 모델 지원 범위에 맞춰 나중에 붙인다.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import ModelPicker from './model-picker';
import type { Effort } from '@/app/lib/ai/effort';
import AttachMenu from './attach-menu';
import AttachmentChips from './attachment-chips';
import { VoiceButton, VoiceConsentDialog, VoiceWaveform, useVoiceInput } from './voice-input';
import { voiceConsentStrings } from './voice-strings';
import { exportConversation } from './export-session';
import type { ConversationMessage } from './conversation';

import type { PendingAttachment } from './pending-attachments';

export type { PendingAttachment };

export default function Composer({
  sessionId,
  messages,
  disabled,
  model,
  onModelChange,
  effort,
  onEffortChange,
  liveModel,
  onSend,
  onStop,
}: {
  sessionId: string;
  messages: ConversationMessage[];
  disabled: boolean;
  model: string;
  onModelChange: (id: string) => void;
  effort: Effort;
  onEffortChange: (next: Effort) => void;
  liveModel: boolean;
  onSend: (question: string, attachments: PendingAttachment[]) => void;
  /** 생성 중일 때 눌리는 중단 — disabled가 true인 동안에만 노출된다 */
  onStop: () => void;
}) {
  const { language } = useLanguage();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 받아쓰기 결과는 입력창에 그대로 이어 붙인다 — 말한 뒤 손으로 고칠 수 있게
  const appendSpoken = useCallback((spoken: string) => {
    setText((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${spoken}` : spoken));
  }, []);
  const voice = useVoiceInput({ lang: language === 'en' ? 'en-US' : 'ko-KR', onCommit: appendSpoken });

  // 입력 높이 자동 조절 — 여러 줄 질문도 알약 안에서 자연스럽게 늘어난다
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  // 미리보기 objectURL 정리 — 화면을 떠날 때 한 번만 푼다.
  // (attachments를 의존성에 넣으면 두 번째 파일을 붙이는 순간 첫 번째 미리보기가
  //  해제돼 썸네일이 깨진다. 그래서 최신 목록을 effect 안에서만 따라간다.)
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(
    () => () => {
      attachmentsRef.current.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    },
    [],
  );

  function submit() {
    if (!text.trim() || disabled || busy) return;
    if (voice.listening) voice.stop();
    onSend(text, attachments);
    setText('');
    setAttachments([]);
    setNotice(null);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-paper via-paper/95 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 sm:px-4 sm:pb-6 sm:pt-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mx-auto w-full max-w-3xl"
      >
        {messages.length > 0 && (
          <div className="mb-2 flex items-center justify-end gap-2">
            {/* 전체 대화 내보내기 — 개별 답변만 내보내려면 그 답변의 툴바를 쓴다 */}
            <span className="text-[11px] text-fg-muted">{t('ai-export-hint', language)}</span>
            <button
              type="button"
              onClick={() => exportConversation(messages)}
              disabled={disabled}
              title={t('ai-export-all-hint', language)}
              className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-[11px] font-semibold text-fg-secondary transition hover:border-brand-300 hover:text-signal disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-fg-secondary"
            >
              {t('ai-export-all', language)}
            </button>
          </div>
        )}

        <AttachmentChips
          files={attachments}
          onRemove={(index) => setAttachments((prev) => prev.filter((_, i) => i !== index))}
          className="mb-2"
        />

        {(notice || voice.error) && <p className="mb-2 text-[11px] text-rose-600">{notice ?? voice.error}</p>}

        {/* 알약 입력 — 첨부 · 입력 · 모델(강도 포함) · 음성 · 전송.
            넓은 화면은 한 줄, 좁은 화면(스마트폰)은 컨트롤 묶음이 아랫줄로 내려간다.
            여섯 개를 360px 안에 억지로 우겨넣으면 입력창이 손톱만 해지기 때문이다.

            정렬은 items-center다. items-end로 두면 높이가 다른 컨트롤(40px 버튼과
            한 줄짜리 입력)의 바닥만 맞아, 알약 안에서 아이콘이 아래로 처져 보였다.
            좌우 여백도 px로 맞춰 '+'와 전송 버튼이 모서리에서 같은 거리에 놓인다. */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-[1.75rem] border border-hairline bg-surface px-2 py-1.5 sm:flex-nowrap sm:px-2.5 sm:py-2 shadow-[0_2px_10px_rgba(24,0,172,0.06),0_10px_36px_rgba(24,0,172,0.12)] transition focus-within:shadow-[0_2px_12px_rgba(24,0,172,0.10),0_14px_44px_rgba(24,0,172,0.18)]">
          <AttachMenu
            placement="top"
            disabled={disabled}
            onNotice={setNotice}
            onBusyChange={setBusy}
            onAdd={(files) => setAttachments((prev) => [...prev, ...files])}
          />

          {/* 듣는 중에는 입력 자리를 파형이 대신한다 — 받아쓰기가 그 아래로 쌓인다 */}
          {voice.listening ? (
            <VoiceWaveform
              analyser={voice.analyser}
              transcript={text}
              interim={voice.interim}
              placeholder={t('ai-voice-listening', language)}
            />
          ) : (
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={disabled}
              placeholder={t('ai-search-followup-placeholder', language)}
              aria-label={t('ai-search-followup-placeholder', language)}
              className="dc-scroll min-w-0 flex-1 resize-none bg-transparent px-1.5 py-3 text-[15px] leading-6 text-fg placeholder:text-fg-quiet focus:outline-none disabled:cursor-not-allowed disabled:text-fg-quiet"
            />
          )}

          {/* 모델 · 음성 · 전송 — 폰에서는 이 묶음이 통째로 아랫줄로 내려간다 */}
          <div className="flex w-full items-center gap-1.5 sm:w-auto sm:gap-2 sm:pr-0.5">
            {/* 강도(Effort)는 이 메뉴 안에 함께 들어 있다 */}
            <ModelPicker
              value={model}
              onChange={onModelChange}
              effort={effort}
              onEffortChange={onEffortChange}
              disabled={disabled}
              live={liveModel}
            />

            {/* 폰에서만 — 전송 버튼을 오른쪽 끝으로 민다 */}
            <span aria-hidden className="flex-1 sm:hidden" />

            <VoiceButton
              listening={voice.listening}
              onClick={voice.toggle}
              disabled={disabled || !voice.supported}
              label={t('ai-voice-start', language)}
              stopLabel={t('ai-voice-stop', language)}
            />

            {/* 생성 중에는 같은 자리가 중단 버튼이 된다 — 누를 곳을 찾아 헤매지 않도록 */}
            {disabled ? (
              <button
                type="button"
                onClick={onStop}
                aria-label={t('ai-stop', language)}
                title={t('ai-stop', language)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white shadow-sm transition hover:bg-ink/85 active:scale-95"
              >
                {/* 정지 — 사각형 둘레에 진행 링을 돌려 "아직 도는 중"임을 남긴다 */}
                <span aria-hidden className="relative grid h-full w-full place-items-center">
                  <span className="absolute inset-[3px] animate-spin rounded-full border-2 border-white/15 border-t-white/70 motion-reduce:animate-none" />
                  <span className="block h-[9px] w-[9px] rounded-[2px] bg-surface" />
                </span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!text.trim() || busy}
                aria-label={t('ai-search-submit', language)}
                title={t('ai-search-submit', language)}
                className="group/send grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-signal text-white shadow-[0_2px_8px_rgba(24,0,172,0.28)] transition-[color,background-color,border-color,box-shadow,transform] hover:shadow-[0_3px_12px_rgba(24,0,172,0.4)] active:scale-95 disabled:bg-none disabled:bg-paper disabled:text-fg-quiet disabled:shadow-none"
              >
                {busy ? (
                  <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />
                ) : (
                  // 오른쪽을 향한 종이비행기 — 뾰족한 끝이 진행 방향(전송)을 가리킨다.
                  // 접힌 선을 기준으로 위아래 날개가 대칭이고, 아래 날개만 살짝 어둡게 해
                  // 종이가 접힌 면으로 읽힌다. 가로로 누운 도형은 시각 중심이 왼쪽으로 쏠려
                  // viewBox를 살짝 밀어(-0.8) 버튼 한가운데에 맞춘다.
                  <svg
                    viewBox="-0.8 0 24 24"
                    className="h-[17px] w-[17px] transition-transform duration-150 group-hover/send:translate-x-px"
                    aria-hidden
                  >
                    <path d="M20.6 12 4.1 3.9 7.6 12Z" fill="currentColor" />
                    <path d="M20.6 12 4.1 20.1 7.6 12Z" fill="currentColor" fillOpacity="0.72" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-fg-quiet">
          {disabled ? (
            t('ai-generating-hint', language)
          ) : (
            <>
              <span className="hidden sm:inline">{t('ai-composer-hint', language)} — </span>
              {t('ai-search-disclaimer-short', language)}{' '}
              <Link
                href="/legal/ai-terms"
                className="font-medium text-signal underline underline-offset-2 hover:text-brand-700"
              >
                {t('ai-terms-link', language)}
              </Link>
            </>
          )}
        </p>

        <input type="hidden" name="sessionId" value={sessionId} />
      </form>

      {/* 브라우저 권한 창 전에 한 번 — 음성이 어디로 가는지 밝힌다 */}
      <VoiceConsentDialog
        open={voice.askingConsent}
        onAccept={voice.acceptConsent}
        onDecline={voice.declineConsent}
        permission={voice.permission}
        strings={voiceConsentStrings(language)}
      />
    </div>
  );
}
