'use client';

// AI Search 컴포저 — 알약 입력 안에 [+ 첨부] [입력] [모델] [음성] [전송]을 함께 둔다.
//
// 첨부는 알약 **안쪽**에 산다. 히어로 검색바(app/study/ai-search.tsx)와 같은 규칙이다.
//   · 업로드한 파일·Drive → 입력줄 위 정사각 썸네일 캐러셀
//   · GitHub·Local 프로젝트·URL → 같은 캐러셀에 덩어리 하나당 카드 하나
// 파일은 끌어다 놓아도 붙는다(폴더째로도).
// 붙인 파일의 원문은 서버가 읽어 모델 프롬프트에 싣는다(app/lib/ai/attachment-context.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import ModelPicker from './model-picker';
import { findSearchModel } from '@/app/lib/ai/search-models';
import { thumbKindOf } from './pending-attachments';
import type { Effort } from '@/app/lib/ai/effort';
import AttachMenu from './attach-menu';
import AttachmentCarousel from './attachment-carousel';
import { useAttachmentSlots } from './attachment-slots';
import { useFileDrop } from './use-file-drop';
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
  centered = false,
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
  /** 빈 대화 — 화면 가운데에서 시작한다(맨 아래 칸이 아니라) */
  centered?: boolean;
}) {
  const { language } = useLanguage();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attachments = useAttachmentSlots({ onNotice: setNotice });

  // 끌어다 놓기 — 폴더면 그 이름으로 묶어 참조 하나가 된다
  const drop = useFileDrop({
    disabled,
    onDrop: ({ files, folder, limited }) => {
      if (limited) setNotice('파일이 많아 앞의 40개만 첨부합니다.');
      void attachments.upload(
        files.map((entry) => ({ file: entry.file, name: entry.path })),
        folder ? 'project' : 'local',
        folder,
      );
    },
  });

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

  function submit() {
    // 올라가는 중에 보내면 그 첨부는 빠진 채로 질문이 간다
    if (!text.trim() || disabled || busy || attachments.uploading) return;
    if (voice.listening) voice.stop();
    onSend(text, attachments.files);
    setText('');
    attachments.clear();
    setNotice(null);
  }

  // 그림을 붙였는데 지금 모델이 그림을 못 보는 경우 — 보내기 전에 알린다.
  // 그냥 보내면 모델은 그림을 보지 못한 채 답하고, 이용자는 왜 엉뚱한 답이 왔는지 모른다.
  const hasImage = attachments.files.some((file) => thumbKindOf(file) === 'image');
  const blindToImages = hasImage && !findSearchModel(model).vision;

  return (
    // 화면에 고정(fixed)하지 않는다. 대화 열의 마지막 칸으로 앉아 있으면 레일 폭을
    // 따로 계산해 비켜 줄 일도, 스크롤 영역과 어긋날 일도 없다.
    //
    // 빈 대화(centered)에서는 맨 아래가 아니라 인사말 바로 아래에 놓인다 — 아직 읽을
    // 것이 없는 화면에서 입력창만 바닥에 붙어 있으면 화면 한가운데가 텅 빈다.
    <div
      className={
        centered
          ? 'w-full'
          : 'shrink-0 border-t border-hairline bg-paper px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4'
      }
    >
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

        {(notice || voice.error) && <p className="mb-2 text-[11px] text-rose-600">{notice ?? voice.error}</p>}

        {/* 그림을 못 보는 모델 — 무엇을 하면 되는지까지 적는다 */}
        {blindToImages && !notice && (
          <p className="mb-2 text-[11px] leading-relaxed text-amber-700">{t('ai-model-no-vision', language)}</p>
        )}

        {/* 입력 상자는 두 줄이다.
              1줄  쓰는 곳 — 폭을 통째로 쓴다
              2줄  [+ 첨부] [모델·강도] ····· [음성] [전송]

            한 줄에 여섯 개를 늘어놓던 예전 알약은, 글이 두 줄만 넘어가도 컨트롤이
            아래로 밀리며 버튼 자리가 매번 달라졌다. 쓰는 칸과 누르는 칸을 나누면
            글이 아무리 길어져도 버튼은 늘 같은 자리에 있다. */}
        <div
          {...drop.handlers}
          className={`relative flex flex-col rounded-[var(--radius-panel)] border bg-surface px-2 pb-2 pt-1 shadow-[0_2px_10px_rgba(24,0,172,0.06),0_10px_36px_rgba(24,0,172,0.12)] transition focus-within:shadow-[0_2px_12px_rgba(24,0,172,0.10),0_14px_44px_rgba(24,0,172,0.18)] ${
            drop.dragging ? 'border-signal' : 'border-hairline'
          }`}
        >
          {/* 끌어다 놓는 중 — 어디에 놓으면 되는지 입력창 위에 그대로 덮어 보여 준다 */}
          {drop.dragging && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[var(--radius-panel)] bg-surface/95 text-[13px] font-semibold text-signal"
            >
              {t('ai-attach-drop-here', language)}
            </div>
          )}
          {/* 붙인 파일 — 알약 안에서 가로로만 흐른다. 몇 개를 붙이든 높이가 한 줄이다. */}
          {(attachments.files.length > 0 || attachments.tasks.length > 0) && (
            <AttachmentCarousel
              files={attachments.files}
              tasks={attachments.tasks}
              onRemove={attachments.remove}
              onRemoveGroup={attachments.removeGroup}
              className="px-1 pt-1.5"
            />
          )}

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
              className="dc-scroll w-full resize-none bg-transparent px-2 pb-1 pt-2.5 text-[15px] leading-6 text-fg placeholder:text-fg-quiet focus:outline-none disabled:cursor-not-allowed disabled:text-fg-quiet"
            />
          )}

          {/* 2줄 — 왼쪽은 붙이고 고르는 것, 오른쪽은 보내는 것 */}
          <div className="flex items-center gap-1">
            <AttachMenu
              placement="top"
              disabled={disabled}
              onNotice={setNotice}
              onBusyChange={setBusy}
              onAdd={attachments.add}
              onUpload={attachments.upload}
            />

            {/* 강도(Effort)는 이 메뉴 안에 함께 들어 있다 */}
            <ModelPicker
              value={model}
              onChange={onModelChange}
              effort={effort}
              onEffortChange={onEffortChange}
              disabled={disabled}
              live={liveModel}
            />

            {/* 보내는 쪽을 오른쪽 끝으로 민다 */}
            <span aria-hidden className="flex-1" />

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
                disabled={!text.trim() || busy || attachments.uploading}
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

        <p className="mt-2 px-1 text-[11px] text-fg-quiet">
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
