'use client';

// 첨부 미리보기 — 카드를 누르면 열리는 전체 화면 뷰어.
//
// 예전에는 붙인 파일을 다시 확인할 방법이 없었다. 이름만 보고 "그 파일이 맞나" 짐작해야
// 했고, 이미지조차 12px 썸네일이 전부였다. 구글 드라이브처럼 화면 위에 띄워 그 자리에서
// 확인하고 닫는 방식으로 바꾼다.
//
// 열리는 형태는 previewKindOf가 정한다(이미지·영상·오디오·PDF·텍스트).
// 판별되지 않는 형식은 억지로 열지 않고 내려받기만 안내한다 — 브라우저가 못 여는 파일을
// 빈 화면으로 보여 주는 것이 가장 나쁘다.
import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { extLabel, formatBytes, previewKindOf, type PendingAttachment } from './pending-attachments';

/** 텍스트 미리보기로 받아올 최대 바이트 — 통째로 받으면 큰 파일에서 브라우저가 멈춘다. */
const TEXT_LIMIT = 200 * 1024;

function TextViewer({ url }: { url: string }) {
  const { language } = useLanguage();
  const [state, setState] = useState<{ text?: string; error?: boolean }>({});

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('failed'))))
      .then((text) => setState({ text: text.slice(0, TEXT_LIMIT) }))
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') setState({ error: true });
      });
    return () => controller.abort();
  }, [url]);

  if (state.error) {
    return <p className="p-8 text-center text-sm text-fg-on-dark-muted">{t('preview-failed', language)}</p>;
  }
  if (state.text === undefined) {
    return <p className="p-8 text-center text-sm text-fg-on-dark-quiet">{t('loading', language)}</p>;
  }
  return (
    <pre className="dc-scroll max-h-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/40 p-5 font-mono text-[12px] leading-relaxed text-fg-on-dark">
      {state.text}
    </pre>
  );
}

export default function AttachmentPreview({
  files,
  index,
  onIndexChange,
  onClose,
}: {
  files: PendingAttachment[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const file = files[index];

  const go = useCallback(
    (delta: number) => {
      if (files.length < 2) return;
      onIndexChange((index + delta + files.length) % files.length);
    },
    [files.length, index, onIndexChange],
  );

  // Esc로 닫고 ←/→로 넘긴다. 뷰어가 떠 있는 동안 뒤 배경은 스크롤되지 않게 잠근다.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [go, onClose]);

  if (!file) return null;

  const kind = previewKindOf(file);
  const navBtn =
    'grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg-on-dark-secondary transition-colors hover:bg-white/10 hover:text-white';

  return (
    // z-[100] — 전역 헤더(z-50)보다 위. 헤더에 가려지지 않도록 항상 화면 기준으로 띄운다.
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-ink/95 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      {/* 머리글 — 파일 이름 · 용량 · 내려받기 · 닫기 */}
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 font-mono text-[10px] font-bold text-fg-on-dark-secondary"
        >
          {extLabel(file.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white" title={file.name}>
            {file.name}
          </span>
          <span className="block font-mono text-[11px] text-fg-on-dark-quiet">
            {[formatBytes(file.size), files.length > 1 ? `${index + 1} / ${files.length}` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>

        <a
          href={file.url}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-xl border border-white/15 px-3 py-1.5 text-[12px] font-medium text-fg-on-dark transition hover:border-white/40 hover:text-white"
        >
          {t('preview-open-new-tab', language)}
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close', language)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-on-dark-secondary transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.6]" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* 본문 */}
      <div className="flex min-h-0 flex-1 items-center gap-2 px-2 pb-4 sm:px-4 sm:pb-6">
        {files.length > 1 && (
          <button type="button" onClick={() => go(-1)} className={navBtn} aria-label={t('preview-prev', language)}>
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.6]" aria-hidden>
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          {kind === 'image' && (
             
            <img
              src={file.previewUrl || file.url}
              alt={file.name}
              className="max-h-full max-w-full rounded-xl object-contain animate-in fade-in duration-200"
            />
          )}

          {kind === 'video' && (
            <video
              src={file.url}
              controls
              playsInline
              className="max-h-full max-w-full rounded-xl bg-black"
            >
              <track kind="captions" />
            </video>
          )}

          {kind === 'audio' && (
            <div className="w-full max-w-lg rounded-[var(--radius-panel)] bg-white/[0.06] p-6 text-center">
              <p className="mb-4 truncate text-sm text-fg-on-dark-secondary">{file.name}</p>
              <audio src={file.url} controls className="w-full">
                <track kind="captions" />
              </audio>
            </div>
          )}

          {kind === 'pdf' && (
            <iframe
              src={file.url}
              title={file.name}
              className="h-full w-full rounded-xl border-0 bg-white"
            />
          )}

          {kind === 'text' && (
            <div className="h-full w-full max-w-4xl">
              <TextViewer url={file.url} />
            </div>
          )}

          {kind === null && (
            <div className="rounded-[var(--radius-panel)] border border-white/10 bg-white/[0.04] px-8 py-12 text-center">
              <p className="text-sm text-fg-on-dark-secondary">{t('preview-unsupported', language)}</p>
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-block rounded-xl bg-white/10 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-white/20"
              >
                {t('preview-open-new-tab', language)}
              </a>
            </div>
          )}
        </div>

        {files.length > 1 && (
          <button type="button" onClick={() => go(1)} className={navBtn} aria-label={t('preview-next', language)}>
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.6]" aria-hidden>
              <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
