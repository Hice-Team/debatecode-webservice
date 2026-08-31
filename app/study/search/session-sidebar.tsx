'use client';

// AI Search 사이드바 — 새 대화 · 대화 검색 · 폴더 · 최근 · 설정.
//
// 두 가지 모습으로 산다.
//   펼침(w-64)  넓은 화면의 기본. 대화 열을 **밀어낸다**(겹치지 않는다) —
//               겹쳐 두면 목록을 보면서 답변을 함께 읽을 수 없다.
//   접힘(w-14)  아이콘만. 답변에 집중하고 싶을 때.
// 좁은 화면(<lg)에서는 접힘이 기본이고, 펼치면 서랍처럼 위에 겹친다(밀어낼 폭이 없다).
//
// 폴더는 이용자가 직접 만드는 묶음이다. 자동 분류는 엉뚱한 곳에 넣어 놓고 왜 거기 있는지
// 설명하지 못하는데, 대화 기록에서 그건 "잃어버렸다"와 같은 뜻이다.
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createFolder,
  deleteFolder,
  deleteSession,
  moveSessionToFolder,
  startNewSession,
} from '@/app/lib/actions/ai-search';
import { importSessionFile } from '@/app/lib/actions/ai-search-transfer';

export interface SessionSummary {
  id: string;
  title: string | null;
  folderId: string | null;
  updatedAt: string;
  messageCount: number;
}

export interface FolderSummary {
  id: string;
  name: string;
  sessionCount: number;
}

/** 처음에 펼쳐 보여 줄 폴더 수 — 그 이상은 "더 보기"로 접는다. */
const FOLDERS_SHOWN = 4;

/** 오늘 · 어제 · 지난 7일 · 그 이전 — 목록이 길어질수록 날짜 묶음이 길잡이가 된다. */
function bucketOf(iso: string): string {
  const now = new Date();
  const at = new Date(iso);
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days <= 0 && now.getDate() === at.getDate()) return '오늘';
  if (days <= 1) return '어제';
  if (days <= 7) return '지난 7일';
  if (days <= 30) return '지난 30일';
  return at.getFullYear() === now.getFullYear() ? `${at.getMonth() + 1}월` : `${at.getFullYear()}년`;
}

const ICON = 'h-[18px] w-[18px] shrink-0 fill-none stroke-current stroke-[1.7]';

const Icons = {
  panel: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  ),
  compose: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m14.5 6.5 3 3" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.4-3.4" strokeLinecap="round" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  ),
};

const ITEM =
  'flex w-full items-center gap-3 rounded-full px-3 py-2 text-left text-[13px] font-medium text-fg-secondary transition-colors hover:bg-ink/[0.05] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
const SECTION = 'px-3 pb-1 pt-4 text-[11px] font-semibold text-fg-muted';

/* ---------- 대화 한 줄 ---------- */

function SessionRow({
  session,
  active,
  folders,
  onDeleted,
  onNavigate,
}: {
  session: SessionSummary;
  active: boolean;
  folders: FolderSummary[];
  onDeleted: (id: string) => void;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLLIElement>(null);

  // 메뉴 바깥을 누르거나 Esc를 누르면 닫는다
  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  function move(folderId: string) {
    startTransition(async () => {
      const body = new FormData();
      body.set('sessionId', session.id);
      body.set('folderId', folderId);
      await moveSessionToFolder(body);
      setMenu(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const body = new FormData();
      body.set('sessionId', session.id);
      await deleteSession(body);
      onDeleted(session.id);
      setMenu(false);
      // 보고 있던 대화를 지웠으면 새 대화로 빠져나간다 — 없는 화면에 남아 있을 수 없다
      if (active) router.push('/study/search');
      else router.refresh();
    });
  }

  return (
    <li ref={rootRef} className="group/row relative">
      <Link
        href={`/study/search?session=${session.id}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`block truncate rounded-full py-2 pl-3 pr-9 text-[13px] transition-colors ${
          active ? 'bg-brand-50 font-medium text-fg' : 'text-fg-secondary hover:bg-ink/[0.05] hover:text-fg'
        }`}
        title={session.title ?? '제목 없는 대화'}
      >
        {session.title ?? '제목 없는 대화'}
      </Link>

      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        aria-label={`${session.title ?? '이 대화'} 메뉴`}
        aria-expanded={menu}
        className={`absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-fg-quiet transition hover:bg-ink/[0.08] hover:text-fg ${
          menu ? 'opacity-100' : 'sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus-visible:opacity-100'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {menu && (
        <div
          role="menu"
          className="absolute right-1 top-9 z-50 w-48 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface py-1 shadow-[0_12px_32px_rgba(8,9,26,0.12)]"
        >
          {folders.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold text-fg-quiet">폴더로 옮기기</p>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitem"
                  disabled={pending || folder.id === session.folderId}
                  onClick={() => move(folder.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-fg-secondary transition-colors hover:bg-paper disabled:opacity-40"
                >
                  {Icons.folder}
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
            </>
          )}
          {session.folderId && (
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => move('')}
              className="w-full px-3 py-1.5 text-left text-[12px] text-fg-secondary transition-colors hover:bg-paper disabled:opacity-40"
            >
              폴더에서 빼기
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={remove}
            className={`w-full border-t border-hairline px-3 py-1.5 text-left text-[12px] font-medium transition-colors disabled:opacity-40 ${
              confirming ? 'bg-rose-50 text-rose-700' : 'text-rose-600 hover:bg-rose-50'
            }`}
          >
            {confirming ? '한 번 더 누르면 삭제됩니다' : '대화 삭제'}
          </button>
        </div>
      )}
    </li>
  );
}

/* ---------- 펼친 사이드바 ---------- */

function Panel({
  sessions,
  folders,
  activeId,
  onCollapse,
  onDeleted,
  onNavigate,
}: {
  sessions: SessionSummary[];
  folders: FolderSummary[];
  activeId: string;
  onCollapse: () => void;
  onDeleted: (id: string) => void;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [allFolders, setAllFolders] = useState(false);
  // 펼쳐 둔 폴더 — 안에 든 대화를 그 자리에서 보여 준다.
  // 폴더마다 페이지를 따로 두면 대화를 고르는 데 화면 이동이 한 번 더 든다.
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  function startNew() {
    onNavigate();
    startTransition(async () => {
      const { sessionId } = await startNewSession();
      router.push(`/study/search?session=${sessionId}`);
    });
  }

  function submitFolder() {
    const name = folderName.trim();
    if (!name) return;
    startTransition(async () => {
      const body = new FormData();
      body.set('name', name);
      const result = await createFolder(body);
      if (result.error) setNotice(result.error);
      else {
        setFolderName('');
        setAdding(false);
        router.refresh();
      }
    });
  }

  function removeFolder(id: string, name: string) {
    // 폴더만 사라지고 대화는 남는다 — 그 사실을 물어보는 문장에 함께 적는다
    if (!window.confirm(`"${name}" 폴더를 지울까요? 안에 있던 대화는 남습니다.`)) return;
    startTransition(async () => {
      const body = new FormData();
      body.set('folderId', id);
      await deleteFolder(body);
      router.refresh();
    });
  }

  /** 내보내 둔 .json 대화를 새 세션으로 되살린다. */
  function importSessions(files: FileList | null) {
    if (!files || files.length === 0) return;
    setNotice(null);
    startTransition(async () => {
      let lastId = '';
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set('fileName', file.name);
        body.set('payload', await file.text());
        const result = await importSessionFile({}, body);
        if (result.errors?.form?.length) {
          setNotice(result.errors.form[0]);
          continue;
        }
        if (result.sessionId) lastId = result.sessionId;
      }
      if (lastId) {
        onNavigate();
        router.push(`/study/search?session=${lastId}`);
      }
    });
  }

  const term = query.trim().toLowerCase();
  const matched = term
    ? sessions.filter((s) => (s.title ?? '').toLowerCase().includes(term))
    : sessions.filter((s) => !s.folderId);

  // 날짜 묶음으로 나눈다 — 붙인 순서(최신순)를 그대로 지킨다
  const buckets: Array<{ label: string; items: SessionSummary[] }> = [];
  for (const session of matched) {
    const label = bucketOf(session.updatedAt);
    const last = buckets[buckets.length - 1];
    if (last?.label === label) last.items.push(session);
    else buckets.push({ label, items: [session] });
  }

  const shownFolders = allFolders ? folders : folders.slice(0, FOLDERS_SHOWN);

  return (
    <div className="flex h-full w-64 flex-col bg-surface">
      {/* 머리 — 접기 버튼 */}
      <div className="flex shrink-0 items-center justify-between px-3 pt-3">
        <p className="px-1 font-display text-[13px] font-bold tracking-tight text-fg">AI Search</p>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="사이드바 접기"
          title="사이드바 접기"
          className="grid h-8 w-8 place-items-center rounded-full text-fg-muted transition-colors hover:bg-ink/[0.06] hover:text-fg"
        >
          {Icons.panel}
        </button>
      </div>

      <div className="shrink-0 px-2 pt-2">
        <button type="button" onClick={startNew} disabled={pending} className={`${ITEM} disabled:opacity-40`}>
          {Icons.compose}
          새 대화
        </button>

        {searching ? (
          <div className={`${ITEM} hover:bg-transparent`}>
            {Icons.search}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQuery('');
                  setSearching(false);
                }
              }}
              onBlur={() => !query && setSearching(false)}
              placeholder="대화 검색"
              aria-label="대화 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-quiet focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSearching(false);
                }}
                aria-label="검색 지우기"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-fg-quiet hover:bg-ink/[0.08] hover:text-fg"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[2.4]" aria-hidden>
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setSearching(true)} className={ITEM}>
            {Icons.search}
            대화 검색
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* 폴더 — 검색 중에는 감춘다(검색 결과가 화면의 주인공이다) */}
        {!term && (
          <>
            <p className={SECTION}>폴더</p>

            {adding ? (
              <div className={`${ITEM} hover:bg-transparent`}>
                {Icons.folder}
                <input
                  autoFocus
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      submitFolder();
                    }
                    if (e.key === 'Escape') {
                      setFolderName('');
                      setAdding(false);
                    }
                  }}
                  onBlur={() => folderName.trim() ? submitFolder() : setAdding(false)}
                  placeholder="폴더 이름"
                  aria-label="새 폴더 이름"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-quiet focus:outline-none"
                />
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className={ITEM}>
                {Icons.plus}
                폴더 추가
              </button>
            )}

            {shownFolders.map((folder) => {
              const expanded = openFolders.includes(folder.id);
              const inside = sessions.filter((session) => session.folderId === folder.id);
              return (
                <div key={folder.id}>
                  <div className="group/folder relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFolders((prev) =>
                          prev.includes(folder.id)
                            ? prev.filter((id) => id !== folder.id)
                            : [...prev, folder.id],
                        )
                      }
                      aria-expanded={expanded}
                      className={`${ITEM} pr-9`}
                      title={`${folder.name} · 대화 ${folder.sessionCount}개`}
                    >
                      {Icons.folder}
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-fg-quiet">{folder.sessionCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFolder(folder.id, folder.name)}
                      disabled={pending}
                      aria-label={`${folder.name} 폴더 삭제`}
                      className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-fg-quiet opacity-0 transition hover:bg-ink/[0.08] hover:text-rose-600 group-hover/folder:opacity-100 focus-visible:opacity-100"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]" aria-hidden>
                        <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {/* 폴더 안 — 왼쪽에 얇은 선을 둬 어디에 속한 목록인지 보이게 한다 */}
                  {expanded && (
                    <ul className="ml-6 space-y-px border-l border-hairline pl-1">
                      {inside.length === 0 ? (
                        <li className="px-2 py-2 text-[11px] leading-relaxed text-fg-muted">
                          비어 있습니다. 대화 옆 ⋯ 메뉴에서 이 폴더로 옮길 수 있습니다.
                        </li>
                      ) : (
                        inside.map((session) => (
                          <SessionRow
                            key={session.id}
                            session={session}
                            folders={folders}
                            active={session.id === activeId}
                            onDeleted={onDeleted}
                            onNavigate={onNavigate}
                          />
                        ))
                      )}
                    </ul>
                  )}
                </div>
              );
            })}

            {folders.length > FOLDERS_SHOWN && (
              <button
                type="button"
                onClick={() => setAllFolders((v) => !v)}
                className={`${ITEM} text-fg-muted`}
              >
                <span className="w-[18px]" aria-hidden />
                {allFolders ? '접기' : `더 보기 (${folders.length - FOLDERS_SHOWN})`}
              </button>
            )}
          </>
        )}

        {/* 최근 — 검색 중이면 검색 결과가 이 자리에 온다 */}
        <p className={SECTION}>{term ? `"${query}" 검색 결과` : '최근'}</p>

        {matched.length === 0 ? (
          <p className="px-3 py-3 text-[12px] leading-relaxed text-fg-muted">
            {term ? '제목이 일치하는 대화가 없습니다.' : '아직 나눈 대화가 없습니다. 무엇이든 물어보면 이곳에 쌓입니다.'}
          </p>
        ) : term ? (
          <ul className="space-y-px">
            {matched.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                folders={folders}
                active={session.id === activeId}
                onDeleted={onDeleted}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.label} className="mb-1">
              <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wide text-fg-quiet">
                {bucket.label}
              </p>
              <ul className="space-y-px">
                {bucket.items.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    folders={folders}
                    active={session.id === activeId}
                    onDeleted={onDeleted}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-hairline p-2">
        <label className={`${ITEM} cursor-pointer`}>
          <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
            <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
          대화 불러오기
          <input
            type="file"
            accept="application/json,.json"
            multiple
            hidden
            disabled={pending}
            onChange={(e) => {
              importSessions(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <Link href="/settings?tab=ai" className={ITEM}>
          {Icons.settings}
          설정
        </Link>
        {notice && <p className="px-3 pt-1 text-[11px] text-rose-600">{notice}</p>}
      </div>
    </div>
  );
}

/* ---------- 접힌 레일 ---------- */

function Rail({ onExpand }: { onExpand: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const button =
    'grid h-10 w-10 place-items-center rounded-full text-fg-muted transition-colors hover:bg-ink/[0.06] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

  return (
    <div className="flex h-full w-14 flex-col items-center bg-surface py-3">
      <button type="button" onClick={onExpand} aria-label="사이드바 펼치기" title="사이드바 펼치기" className={button}>
        {Icons.panel}
      </button>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            const { sessionId } = await startNewSession();
            router.push(`/study/search?session=${sessionId}`);
          })
        }
        disabled={pending}
        aria-label="새 대화"
        title="새 대화"
        className={`${button} mt-1 disabled:opacity-40`}
      >
        {Icons.compose}
      </button>
      <button type="button" onClick={onExpand} aria-label="대화 검색" title="대화 검색" className={`${button} mt-1`}>
        {Icons.search}
      </button>

      <span aria-hidden className="flex-1" />

      <Link href="/settings?tab=ai" aria-label="설정" title="설정" className={button}>
        {Icons.settings}
      </Link>
    </div>
  );
}

/* ---------- 진입점 ---------- */

export default function SessionSidebar({
  sessions: initial,
  folders,
  activeId,
  open,
  onOpenChange,
}: {
  sessions: SessionSummary[];
  folders: FolderSummary[];
  activeId: string;
  /** 펼쳐져 있는가 */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // 방금 지운 것 — 서버 목록이 갱신되기 전까지 화면에서 먼저 뺀다.
  // 목록 자체를 state로 복사하지 않는 이유는, 서버가 새 목록을 내려 줄 때마다
  // (대화를 마치면 제목이 생긴다) 되맞추는 effect가 필요해지기 때문이다.
  const [removed, setRemoved] = useState<string[]>([]);
  const sessions = initial.filter((session) => !removed.includes(session.id));
  const onDeleted = (id: string) => setRemoved((prev) => [...prev, id]);

  // 좁은 화면에서 펼쳐져 있는 동안 Esc로 닫는다
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {/* 넓은 화면 — 흐름 안의 열. 펼치면 대화 열을 밀어내고, 접으면 자리를 돌려준다. */}
      <aside
        aria-label="대화 기록"
        className="hidden shrink-0 border-r border-hairline lg:block"
      >
        {open ? (
          <Panel
            sessions={sessions}
            folders={folders}
            activeId={activeId}
            onCollapse={() => onOpenChange(false)}
            onDeleted={onDeleted}
            onNavigate={() => {}}
          />
        ) : (
          <Rail onExpand={() => onOpenChange(true)} />
        )}
      </aside>

      {/* 좁은 화면 — 접힘이 기본. 펼치면 서랍처럼 겹친다(밀어낼 폭이 없다). */}
      <aside aria-label="대화 기록" className="shrink-0 border-r border-hairline lg:hidden">
        <Rail onExpand={() => onOpenChange(true)} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="대화 기록">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 border-r border-hairline shadow-2xl shadow-ink/25 animate-in slide-in-from-left duration-200 motion-reduce:animate-none">
            <Panel
              sessions={sessions}
              folders={folders}
              activeId={activeId}
              onCollapse={() => onOpenChange(false)}
              onDeleted={onDeleted}
              onNavigate={() => onOpenChange(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
