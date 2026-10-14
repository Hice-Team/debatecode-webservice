'use client';

// 첨부 미리보기 — 카드를 누르면 화면 가운데 뜨는 팝업 창.
//
// 크기는 고정이고 내용이 스크롤된다. 파일마다 창 크기가 달라지면 눌러 볼 때마다 눈이
// 다시 자리를 잡아야 한다. 이미지만 예외로 창이 1.45배까지 커진다 — 사진은 전체를
// 한눈에 봐야 의미가 있기 때문이다.
//
// 열리는 형태는 previewKindOf가 정한다.
//   image · video · audio · pdf   브라우저가 직접 그린다
//   text                          코드·문서 원문을 끝까지 (상한에 걸리면 그렇다고 적는다)
//   archive                       zip은 **안에 든 파일 목록**을, docx/pptx/xlsx는 본문 글을
//   null                          "미리보기 불가"라고 분명히 적고 내려받기만 안내한다
//
// 판별되지 않는 형식을 억지로 열지 않는 이유는 하나다 — 브라우저가 못 여는 파일을
// 빈 화면으로 보여 주는 것이 가장 나쁘다.
import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { extLabel, formatBytes, previewKindOf, type PendingAttachment } from './pending-attachments';
import { listZip, readOfficeText, type ZipListing } from './zip-list';

/**
 * 텍스트로 그릴 최대 바이트.
 *
 * 첨부는 처음부터 끝까지 볼 수 있어야 한다 — 200KB에서 말없이 자르면 뒷부분이 있는지조차
 * 알 수 없었다. 여기까지는 전부 그리고, 그보다 큰 파일만 잘렸다고 **적어서** 알린다
 * (한 <pre>에 수십 MB를 밀어 넣으면 브라우저가 멎기 때문에 상한 자체는 남긴다).
 */
const TEXT_LIMIT = 4 * 1024 * 1024;
/** 목록만 읽을 zip의 최대 크기 — 이보다 크면 받아오는 동안 화면이 멎는다. */
const ARCHIVE_LIMIT = 200 * 1024 * 1024;
/** 한 번에 그릴 압축 항목 수 — 이 이상은 DOM이 버티지 못한다. 넘으면 그렇다고 적는다. */
const ARCHIVE_ROWS = 5000;

/**
 * 창 크기는 **고정**이다 — 파일마다 창이 커졌다 작아지면 눈이 매번 다시 자리를 잡아야 한다.
 * 내용이 넘치면 창이 아니라 내용이 스크롤된다.
 *
 * 예외는 이미지 하나다. 사진·스크린샷은 전체를 한눈에 봐야 의미가 있어, 기본 크기의
 * 1.45배까지 창을 넓히도록 허용한다(화면 밖으로 나가지 않는 선에서). 그래도 안 들어가면
 * 그때는 이미지도 스크롤한다 — 잘라서 보여 주지는 않는다.
 */
const PANEL_WIDTH = 'min(48rem, calc(100vw - 2rem))';
const PANEL_HEIGHT = 'min(34rem, calc(100vh - 4rem))';
const IMAGE_GROWTH = 1.45;
const IMAGE_WIDTH = `min(48rem * ${IMAGE_GROWTH}, calc(100vw - 2rem))`;
const IMAGE_HEIGHT = `min(34rem * ${IMAGE_GROWTH}, calc(100vh - 4rem))`;

/** 내용 판 — 넘치는 것은 여기서 스크롤된다. */
const PANEL = 'dc-scroll h-full w-full overflow-auto rounded-[var(--radius-panel)] bg-black/40 p-5';

function Notice({ tone = 'muted', children }: { tone?: 'muted' | 'quiet'; children: React.ReactNode }) {
  return (
    <p className={`p-8 text-center text-sm ${tone === 'quiet' ? 'text-fg-on-dark-quiet' : 'text-fg-on-dark-muted'}`}>
      {children}
    </p>
  );
}

function TextViewer({ url }: { url: string }) {
  const { language } = useLanguage();
  const [state, setState] = useState<{ text?: string; clipped?: boolean; error?: boolean }>({});

  // 파일이 바뀌면 상위에서 key로 새로 마운트한다 — 그래서 여기서 상태를 되돌리지 않는다
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('failed'))))
      .then((text) => setState({ text: text.slice(0, TEXT_LIMIT), clipped: text.length > TEXT_LIMIT }))
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') setState({ error: true });
      });
    return () => controller.abort();
  }, [url]);

  if (state.error) return <Notice>{t('preview-failed', language)}</Notice>;
  if (state.text === undefined) return <Notice tone="quiet">{t('loading', language)}</Notice>;

  return (
    <div className={PANEL}>
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-fg-on-dark">
        {state.text}
      </pre>
      {/* 잘렸으면 그렇다고 적는다 — 조용히 끝나면 그게 파일의 끝인 줄 안다 */}
      {state.clipped && (
        <p className="mt-4 border-t border-white/10 pt-3 font-mono text-[11px] text-fg-on-dark-quiet">
          {t('preview-text-clipped', language)}
        </p>
      )}
    </div>
  );
}

/** 압축 파일 안의 경로를 폴더 깊이만큼 들여쓴다 — 구조가 한눈에 들어온다. */
function depthOf(path: string): number {
  return Math.min(path.replace(/\/$/, '').split('/').length - 1, 6);
}

/**
 * zip 계열 미리보기.
 *
 * docx·pptx·xlsx도 실은 zip이다. 그래서 먼저 본문 글을 꺼내 보고(읽을 수 있으면 그것이
 * 이용자가 원한 것이다), 꺼내지 못하면 들어 있는 파일 목록을 보여 준다.
 */
function ArchiveViewer({ file }: { file: PendingAttachment }) {
  const { language } = useLanguage();
  const [state, setState] = useState<{
    listing?: ZipListing;
    text?: string | null;
    error?: 'failed' | 'not-zip';
  }>({});

  const url = file.url;
  // 너무 큰 압축 파일은 받아 보기 전에 판정한다 — 상태로 만들 필요가 없는 사실이다
  const tooLarge = file.size != null && file.size > ARCHIVE_LIMIT;

  useEffect(() => {
    if (tooLarge) return;
    const controller = new AbortController();

    (async () => {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const listing = await listZip(blob);
      if (!listing) {
        setState({ error: 'not-zip' });
        return;
      }
      // Office 문서면 본문 글이 목록보다 훨씬 쓸모 있다
      const text = await readOfficeText(blob, listing).catch(() => null);
      setState({ listing, text });
    })().catch((error) => {
      if ((error as Error).name !== 'AbortError') setState({ error: 'failed' });
    });

    return () => controller.abort();
  }, [url, tooLarge]);

  if (tooLarge) return <Notice>{t('preview-archive-too-large', language)}</Notice>;
  if (state.error) return <Notice>{t('preview-failed', language)}</Notice>;
  if (!state.listing) return <Notice tone="quiet">{t('loading', language)}</Notice>;

  if (state.text) {
    return (
      <div className={`${PANEL} whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg-on-dark`}>
        {state.text}
      </div>
    );
  }

  const files = state.listing.entries.filter((entry) => !entry.directory);
  if (files.length === 0) return <Notice>{t('preview-archive-empty', language)}</Notice>;

  return (
    <div className={PANEL}>
      <p className="mb-3 font-mono text-[11px] text-fg-on-dark-quiet">
        {t('preview-archive-count', language).replace('{n}', String(files.length))}
        {state.listing.truncated ? ` · ${t('preview-archive-truncated', language)}` : ''}
      </p>
      <ul className="space-y-px">
        {files.slice(0, ARCHIVE_ROWS).map((entry) => (
          <li
            key={entry.path}
            className="flex items-center gap-3 rounded-[var(--radius-control)] py-1 pr-2 text-[12px] hover:bg-white/5"
            style={{ paddingLeft: `${0.5 + depthOf(entry.path) * 0.75}rem` }}
          >
            <span className="min-w-0 flex-1 truncate font-mono text-fg-on-dark-secondary" title={entry.path}>
              {entry.path.split('/').filter(Boolean).pop()}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-fg-on-dark-quiet">{formatBytes(entry.size)}</span>
          </li>
        ))}
      </ul>
      {files.length > ARCHIVE_ROWS && (
        <p className="mt-3 font-mono text-[11px] text-fg-on-dark-quiet">
          {t('preview-archive-more', language).replace('{n}', String(files.length - ARCHIVE_ROWS))}
        </p>
      )}
    </div>
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
    'grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-on-dark-quiet transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return (
    // z-[100] — 전역 헤더(z-50)보다 위. 헤더에 가려지지 않도록 항상 화면 기준으로 띄운다.
    //
    // 화면을 통째로 덮지 않는다. 첨부를 한 번 확인하는 일에 전체 화면을 쓰면 "어디로
    // 돌아가는 건지" 감각이 끊긴다. 뒤 화면이 비치는 창으로 띄우고, 바깥을 누르거나
    // Esc를 누르거나 × 를 눌러 닫는다.
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      {/* 바깥을 눌러도 닫힌다 — 창 닫는 방법이 하나뿐이면 찾아 헤매게 된다 */}
      <button
        type="button"
        aria-label={t('close', language)}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/60 backdrop-blur-sm"
      />

      <div
        className="relative z-10 flex flex-col overflow-hidden rounded-[var(--radius-panel)] bg-ink shadow-[0_12px_32px_rgba(8,9,26,0.32)] ring-1 ring-white/[0.08] transition-[width,height] duration-200 animate-in fade-in zoom-in-95 motion-reduce:zoom-in-100 motion-reduce:transition-none"
        style={{
          width: kind === 'image' ? IMAGE_WIDTH : PANEL_WIDTH,
          height: kind === 'image' ? IMAGE_HEIGHT : PANEL_HEIGHT,
        }}
      >
      {/* 머리글 — 파일 이름 · 용량 · 내려받기 · 닫기 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-3 py-2.5 sm:px-4">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-card)] bg-surface/10 font-mono text-[10px] font-bold text-fg-on-dark-secondary"
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
          className="shrink-0 rounded-[var(--radius-card)] border border-white/15 px-3 py-1.5 text-[12px] font-medium text-fg-on-dark transition hover:border-white/40 hover:text-white"
        >
          {t('preview-open-new-tab', language)}
        </a>
        {/* 닫기 — 창 안에서 가장 찾기 쉬운 자리(오른쪽 위)에 테두리를 둘러 눈에 걸리게 둔다 */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close', language)}
          title={`${t('close', language)} (Esc)`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-fg-on-dark-secondary transition-colors hover:border-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.8]" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* 본문 */}
      <div className="flex min-h-0 flex-1 items-stretch gap-1 p-3 sm:p-4">
        {files.length > 1 && (
          <button type="button" onClick={() => go(-1)} className={navBtn} aria-label={t('preview-prev', language)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]" aria-hidden>
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* 내용은 이 칸 안에서 스크롤된다 — 창은 커지지 않는다 */}
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
          {kind === 'image' && (
            <img
              src={file.previewUrl || file.url}
              alt={file.name}
              className="max-h-full max-w-full rounded-[var(--radius-panel)] object-contain animate-in fade-in duration-200"
            />
          )}

          {kind === 'video' && (
            <video
              src={file.previewUrl || file.url}
              controls
              playsInline
              className="max-h-full max-w-full rounded-[var(--radius-panel)] bg-black"
            >
              <track kind="captions" />
            </video>
          )}

          {kind === 'audio' && (
            <div className="w-full max-w-lg rounded-[var(--radius-panel)] bg-surface/[0.06] p-6 text-center">
              {/* 앨범 아트가 있으면 함께 띄운다 — 음원은 그것이 유일한 그림이다 */}
              {file.artUrl && (
                <img
                  src={file.artUrl}
                  alt=""
                  className="mx-auto mb-4 h-40 w-40 rounded-[var(--radius-panel)] object-cover"
                />
              )}
              <p className="mb-4 truncate text-sm text-fg-on-dark-secondary">{file.name}</p>
              <audio src={file.previewUrl || file.url} controls className="w-full">
                <track kind="captions" />
              </audio>
            </div>
          )}

          {kind === 'pdf' && (
            <iframe
              src={file.url}
              title={file.name}
              className="h-full w-full rounded-[var(--radius-panel)] border-0 bg-surface"
            />
          )}

          {kind === 'text' && (
            <div className="h-full w-full max-w-4xl">
              <TextViewer key={file.url} url={file.url} />
            </div>
          )}

          {kind === 'archive' && (
            <div className="h-full w-full max-w-4xl">
              <ArchiveViewer key={file.url} file={file} />
            </div>
          )}

          {kind === null && (
            <div className="rounded-[var(--radius-panel)] border border-white/10 bg-surface/[0.04] px-8 py-12 text-center">
              <span
                aria-hidden
                className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-[var(--radius-panel)] bg-surface/10 font-mono text-[11px] font-bold text-fg-on-dark-secondary"
              >
                {extLabel(file.name)}
              </span>
              <p className="text-sm font-semibold text-fg-on-dark">{t('preview-unsupported', language)}</p>
              <p className="mt-1 text-[12px] text-fg-on-dark-muted">{t('preview-unsupported-hint', language)}</p>
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-block rounded-[var(--radius-card)] bg-surface/10 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-surface/20"
              >
                {t('preview-open-new-tab', language)}
              </a>
            </div>
          )}
        </div>

        {files.length > 1 && (
          <button type="button" onClick={() => go(1)} className={navBtn} aria-label={t('preview-next', language)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.8]" aria-hidden>
              <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
