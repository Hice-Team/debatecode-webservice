'use client';

// AI Search 첨부 메뉴 — 히어로 검색바와 대화 컴포저가 함께 쓴다.
//
//   파일 업로드
//   Drive에서 파일 추가
//   업로드 더보기 ▸  GitHub에서 코드 가져오기 / Local에서 프로젝트 가져오기 / URL 첨부
//
// 어느 경로로 들어오든 결과는 PendingAttachment 하나로 모인다.
// 업로드 자체는 여기서 끝내고(부모는 URL만 받는다), 실패는 notice로 부모에 올린다.
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { isDriveConfigured, pickFromDrive } from './google-drive';
import { detectKind, type PendingAttachment } from './pending-attachments';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** 프로젝트 폴더는 통째로 올리면 감당이 안 된다 — 코드/문서 파일만 추린다. */
const PROJECT_MAX_FILES = 40;
const SKIP_DIR = /(^|\/)(node_modules|\.git|\.next|dist|build|out|venv|__pycache__|\.venv|target)(\/|$)/;

const ICON = 'h-[17px] w-[17px] shrink-0 fill-none stroke-current stroke-[1.5]';

/* 미니멀 아이콘 — 선 하나짜리로 통일해 메뉴가 시끄러워지지 않게 한다 */
const Icons = {
  file: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6Z" strokeLinejoin="round" />
      <path d="M13 3v6h6" strokeLinejoin="round" />
    </svg>
  ),
  drive: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M9 3h6l6 10.5h-6L9 3Z" strokeLinejoin="round" />
      <path d="m3 13.5 3-5.2 3 5.2-3 5.2-3-5.2Z" strokeLinejoin="round" />
      <path d="M6.6 18.7h11.2l2.6-4.6" strokeLinejoin="round" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path
        d="M9 19c-4 1.2-4-2.3-5.6-2.8M15 21v-3.4c0-1 .1-1.4-.5-2 2.4-.3 4.6-1.2 4.6-5.2a4 4 0 0 0-1.1-2.8 3.7 3.7 0 0 0-.1-2.8s-.9-.3-3 1.1a10.2 10.2 0 0 0-5.4 0C7.4 4.5 6.5 4.8 6.5 4.8a3.7 3.7 0 0 0-.1 2.8A4 4 0 0 0 5.3 10.4c0 4 2.2 4.9 4.6 5.2-.6.6-.6 1.2-.5 2V21"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1" strokeLinecap="round" />
      <path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1" strokeLinecap="round" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" className="ml-auto h-3.5 w-3.5 fill-none stroke-current stroke-2" aria-hidden>
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function AttachMenu({
  onAdd,
  onNotice,
  onBusyChange,
  disabled,
  placement = 'bottom',
}: {
  onAdd: (files: PendingAttachment[]) => void;
  onNotice: (message: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  placement?: 'top' | 'bottom';
}) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [dialog, setDialog] = useState<'github' | 'url' | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const [busy, setBusy] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  // 서브메뉴 닫힘 지연 — 대각선으로 옮겨가는 도중에 닫혀 버리지 않도록 유예를 준다
  const subCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => {
    if (subCloseTimer.current) clearTimeout(subCloseTimer.current);
  }, []);

  function openSub() {
    if (subCloseTimer.current) clearTimeout(subCloseTimer.current);
    setSubOpen(true);
  }
  /** 포인터가 잠깐 벗어나도 바로 닫지 않는다 — 180ms 안에 돌아오면 유지된다. */
  function scheduleSubClose() {
    if (subCloseTimer.current) clearTimeout(subCloseTimer.current);
    subCloseTimer.current = setTimeout(() => setSubOpen(false), 180);
  }

  // 메뉴 바깥 클릭 / Esc 로 닫기 (다이얼로그가 열려 있으면 다이얼로그가 우선)
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeMenu();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
    setSubOpen(false);
  }

  /** 파일 하나를 스토리지에 올려 첨부 메타로 바꾼다. */
  async function upload(file: File, source: PendingAttachment['source'], displayName?: string): Promise<PendingAttachment | null> {
    if (file.size > MAX_FILE_BYTES) {
      onNotice(`"${file.name}"의 용량이 너무 큽니다. (최대 10MB)`);
      return null;
    }
    const body = new FormData();
    body.set('file', file);
    const res = await fetch('/api/ai-search/attachment', { method: 'POST', body });
    if (!res.ok) {
      onNotice(res.status === 401 ? '첨부하려면 로그인이 필요합니다.' : '첨부 업로드에 실패했습니다.');
      return null;
    }
    const data = (await res.json()) as { url: string };
    const name = displayName ?? file.name;
    const kind = detectKind(name, file.type);
    return {
      kind,
      name,
      url: data.url,
      mime: file.type || undefined,
      size: file.size,
      source,
      previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
    };
  }

  async function uploadMany(files: Array<{ file: File; name?: string }>, source: PendingAttachment['source']) {
    if (files.length === 0) return;
    onNotice(null);
    setBusy(true);
    try {
      const accepted: PendingAttachment[] = [];
      for (const entry of files) {
        const result = await upload(entry.file, source, entry.name);
        if (result) accepted.push(result);
      }
      if (accepted.length > 0) onAdd(accepted);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- 파일 업로드 ---------- */
  function handleFiles(list: FileList | null) {
    if (!list) return;
    uploadMany(Array.from(list).map((file) => ({ file })), 'local');
  }

  /* ---------- Local에서 프로젝트 가져오기 ---------- */
  function handleProject(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list)
      .map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name }))
      .filter((entry) => !SKIP_DIR.test(entry.path))
      .filter((entry) => detectKind(entry.path, entry.file.type) !== 'file' || entry.file.size < 512 * 1024);

    if (picked.length === 0) {
      onNotice('가져올 만한 파일을 찾지 못했습니다. (빌드 산출물·의존성 폴더는 제외됩니다)');
      return;
    }
    if (picked.length > PROJECT_MAX_FILES) {
      onNotice(`파일이 너무 많아 앞의 ${PROJECT_MAX_FILES}개만 첨부합니다.`);
    }
    uploadMany(
      picked.slice(0, PROJECT_MAX_FILES).map((entry) => ({ file: entry.file, name: entry.path })),
      'local',
    );
  }

  /* ---------- Drive에서 파일 추가 ---------- */
  async function handleDrive() {
    closeMenu();
    onNotice(null);
    if (!isDriveConfigured()) {
      onNotice(
        'Google Drive 연동이 아직 설정되지 않았습니다. (NEXT_PUBLIC_GOOGLE_CLIENT_ID · NEXT_PUBLIC_GOOGLE_API_KEY · NEXT_PUBLIC_GOOGLE_APP_ID)',
      );
      return;
    }
    setBusy(true);
    try {
      const { files, failed } = await pickFromDrive();
      if (files.length > 0) await uploadMany(files.map((file) => ({ file })), 'drive');
      // 일부만 실패해도 조용히 사라지지 않도록 알린다(권한 회수·내보내기 불가 등).
      // uploadMany가 시작할 때 안내를 지우므로 반드시 그 뒤에 띄운다.
      if (failed > 0) onNotice(`${failed}개 파일을 Drive에서 가져오지 못했습니다.`);
    } catch (error) {
      if ((error as Error).message !== 'cancelled') onNotice('Google Drive에서 파일을 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  /* ---------- GitHub / URL ---------- */
  async function submitDialog() {
    const value = dialogValue.trim();
    const mode = dialog;
    if (!value || !mode) return;
    setDialog(null);
    setDialogValue('');
    onNotice(null);
    setBusy(true);
    try {
      const res = await fetch('/api/ai-search/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, url: value }),
      });
      // 저장소 주소를 넣으면 파일 여러 개가, 파일·URL 하나면 첨부 하나가 온다
      const data = (await res.json()) as PendingAttachment & {
        error?: string;
        files?: PendingAttachment[];
        repo?: string;
        limited?: boolean;
        limit?: number;
      };
      if (!res.ok) {
        onNotice(data.error ?? '가져오지 못했습니다.');
        return;
      }
      if (data.files) {
        onAdd(data.files);
        onNotice(
          data.limited
            ? `${data.repo}에서 ${data.files.length}개 파일을 가져왔습니다. (한 번에 최대 ${data.limit ?? data.files.length}개)`
            : `${data.repo}에서 ${data.files.length}개 파일을 가져왔습니다.`,
        );
        return;
      }
      onAdd([data]);
    } catch {
      onNotice('가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const itemClass =
    'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[13px] text-fg transition-colors hover:bg-paper disabled:opacity-40';
  const panelClass = `absolute left-0 z-50 w-[15rem] max-w-[calc(100vw-2rem)] overflow-visible rounded-[var(--radius-panel)] border border-hairline bg-white py-1.5 shadow-xl shadow-ink/10 animate-in fade-in duration-150 ${
    placement === 'top' ? 'bottom-full mb-2 slide-in-from-bottom-1' : 'top-full mt-2 slide-in-from-top-1'
  }`;

  // "업로드 더보기"의 항목들 — 플라이아웃과 모바일 아코디언이 같은 목록을 쓴다
  const subItems = (
    <>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          setDialog('github');
          setDialogValue('');
          closeMenu();
        }}
      >
        {Icons.github}
        {t('ai-attach-github', language)}
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          projectInputRef.current?.click();
          closeMenu();
        }}
      >
        {Icons.folder}
        {t('ai-attach-project', language)}
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          setDialog('url');
          setDialogValue('');
          closeMenu();
        }}
      >
        {Icons.link}
        {t('ai-attach-url', language)}
      </button>
    </>
  );

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('ai-attach', language)}
        title={t('ai-attach', language)}
        className="grid h-10 w-10 place-items-center rounded-full text-fg-muted transition hover:bg-paper hover:text-signal disabled:opacity-40"
      >
        {busy ? (
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-ink/15 border-t-signal motion-reduce:animate-none" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.7]" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <div role="menu" className={panelClass}>
          <button type="button" role="menuitem" className={itemClass} onClick={() => { fileInputRef.current?.click(); closeMenu(); }}>
            {Icons.file}
            {t('ai-attach-file', language)}
          </button>

          <button type="button" role="menuitem" className={itemClass} onClick={handleDrive}>
            {Icons.drive}
            {t('ai-attach-drive', language)}
          </button>

          {/* 업로드 더보기 — 자주 쓰지 않는 경로를 한 겹 접어 둔다.
              넓은 화면은 옆으로 펼치고(플라이아웃), 좁은 화면은 제자리에서 펼친다(아코디언).
              플라이아웃은 부모와 붙여 놓고 닫힘을 지연시켜, 대각선으로 가다 닫히는 일이 없게 했다. */}
          <div className="relative" onMouseEnter={openSub} onMouseLeave={scheduleSubClose}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={subOpen}
              onClick={() => (subOpen ? setSubOpen(false) : openSub())}
              onFocus={openSub}
              className={`${itemClass} ${subOpen ? 'bg-paper text-signal' : ''}`}
            >
              {Icons.more}
              {t('ai-attach-more', language)}
              <span className={`ml-auto transition-transform ${subOpen ? 'max-sm:rotate-90' : ''}`}>{Icons.chevron}</span>
            </button>

            {subOpen && (
              <>
                {/* 데스크톱·태블릿 — 옆으로 펼치는 플라이아웃 */}
                <div
                  role="menu"
                  onMouseEnter={openSub}
                  className={`absolute left-full z-50 hidden w-[15rem] pl-1 animate-in fade-in slide-in-from-left-1 duration-150 sm:block ${
                    placement === 'top' ? 'bottom-0' : 'top-0'
                  }`}
                >
                  <div className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white py-1.5 shadow-xl shadow-ink/10">
                    {subItems}
                  </div>
                </div>

                {/* 모바일 — 플라이아웃은 화면 밖으로 나가므로 목록 안에서 펼친다 */}
                <div role="menu" className="border-l-2 border-brand-200 bg-paper/60 sm:hidden">
                  {subItems}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 주소 입력 — GitHub 파일 / 일반 URL 공용 */}
      {dialog && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t('close', language)}
            onClick={() => setDialog(null)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md rounded-[var(--radius-panel)] border border-hairline bg-white p-5 shadow-2xl shadow-ink/25">
            <p className="text-sm font-bold text-ink">
              {dialog === 'github' ? t('ai-attach-github', language) : t('ai-attach-url', language)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
              {dialog === 'github' ? t('ai-attach-github-hint', language) : t('ai-attach-url-hint', language)}
            </p>
            <input
              autoFocus
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitDialog();
                }
                if (e.key === 'Escape') setDialog(null);
              }}
              placeholder={dialog === 'github' ? 'https://github.com/owner/repo' : 'https://…'}
              className="mt-3 w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-fg-quiet focus:border-signal focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-xl border border-hairline px-4 py-2 text-sm font-medium text-fg-secondary transition hover:border-ink/25"
              >
                {t('cancel', language)}
              </button>
              <button
                type="button"
                onClick={submitDialog}
                disabled={!dialogValue.trim()}
                className="rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40"
              >
                {t('ai-attach-fetch', language)}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {/* webkitdirectory — 폴더 전체를 고르게 한다(표준 속성이 아니라 ref로 켠다) */}
      <input
        ref={(el) => {
          projectInputRef.current = el;
          if (el) {
            el.setAttribute('webkitdirectory', '');
            el.setAttribute('directory', '');
          }
        }}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleProject(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
