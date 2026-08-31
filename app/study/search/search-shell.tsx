'use client';

// AI Search 셸 — [사이드바 | 대화].
//
//   ┌ Nav ──────────────────────────────────┐
//   ├──────────┬────────────────────────────┤
//   │ 사이드바 │  스크롤되는 대화            │
//   │ (밀어냄) │                            │
//   │          │  붙어 있는 입력창           │
//   └──────────┴────────────────────────────┘
//
// 사이드바는 겹치지 않고 **밀어낸다**. 겹쳐 두면 목록을 보면서 답변을 함께 읽을 수 없다.
// 대화 열은 flex-1이라 사이드바가 펼쳐지고 접힐 때마다 폭이 알아서 따라온다 —
// 어느 쪽도 상대의 크기를 알 필요가 없다.
//
// 펼침 여부를 브라우저에 기억해 둔다. 접어 두고 답변에 집중하던 사람이 화면을 옮길 때마다
// 다시 접어야 하면 그 설정은 없는 것과 같다.
import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import SessionSidebar, { type FolderSummary, type SessionSummary } from './session-sidebar';

const OPEN_KEY = 'dc:ai-search:sidebar-open';

const subscribeNothing = () => () => {};

function readStoredOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

export default function SearchShell({
  sessions,
  folders,
  activeId,
  children,
}: {
  sessions: SessionSummary[];
  folders: FolderSummary[];
  activeId: string;
  children: ReactNode;
}) {
  // 저장된 값은 브라우저에만 있고 서버는 모른다. 렌더 중 window를 만지지 않으려고
  // 서버 스냅샷(펼침)과 클라이언트 스냅샷을 나눠 읽는다.
  const stored = useSyncExternalStore(subscribeNothing, readStoredOpen, () => true);
  // 이번 화면에서 직접 접었다 폈다 한 것 — 저장된 값보다 우선한다
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? stored;

  const change = useCallback((next: boolean) => {
    setOverride(next);
    try {
      window.localStorage.setItem(OPEN_KEY, String(next));
    } catch {
      // 기억하지 못해도 이번 화면에서는 그대로 동작한다
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1">
      <SessionSidebar
        sessions={sessions}
        folders={folders}
        activeId={activeId}
        open={open}
        onOpenChange={change}
      />

      {/* 대화 열 — min-w-0가 없으면 긴 코드 블록이 열을 밀어 가로 스크롤이 생긴다 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
