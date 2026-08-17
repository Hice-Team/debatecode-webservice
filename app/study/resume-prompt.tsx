'use client';

// AI Search 재진입 안내 — 최근 세션이 있으면 이어할지 새로 시작할지 묻는다.
// X로 닫으면 그 세션에 대해서는 다시 묻지 않는다(브라우저에 기억해 둔다).
import { useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startNewSession } from '@/app/lib/actions/ai-search';
import { importSessionFile } from '@/app/lib/actions/ai-search-transfer';

const DISMISS_KEY = 'dc:ai-search:resume-dismissed';

// 닫아 둔 세션 id는 localStorage에만 있고 서버는 모른다.
// 렌더 중 window를 만지지 않으려고 서버 스냅샷(null)과 클라이언트 스냅샷을 나눠 읽는다.
const subscribeNothing = () => () => {};
function readDismissedId(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export default function ResumePrompt({
  sessionId,
  title,
  messageCount,
  updatedAt,
}: {
  sessionId: string;
  title: string | null;
  messageCount: number;
  updatedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closedNow, setClosedNow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 지난번에 이 세션 안내를 닫았는지
  const dismissedId = useSyncExternalStore(subscribeNothing, readDismissedId, () => null);
  const dismissed = closedNow || dismissedId === sessionId;

  function dismiss() {
    setClosedNow(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, sessionId);
    } catch {
      // 저장에 실패해도 이번 화면에서는 닫힌 상태로 둔다
    }
  }

  function resume() {
    router.push(`/study/search?session=${sessionId}`);
  }

  function startNew() {
    startTransition(async () => {
      // 기존 세션 삭제 + 새 세션 생성이 서버에서 한 트랜잭션으로 끝난 뒤 이동한다
      const { sessionId: next } = await startNewSession();
      router.push(`/study/search?session=${next}`);
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
      if (lastId) router.push(`/study/search?session=${lastId}`);
    });
  }

  if (dismissed) return null;

  return (
    <div className="relative mx-auto mt-6 w-full max-w-3xl rounded-2xl border border-brand-200 bg-white p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="이 안내 닫기"
        title="닫기"
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-ink-soft/40 transition hover:bg-paper hover:text-ink-soft"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden>
          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>

      <p className="pr-8 text-sm font-semibold text-ink">이전 대화를 이어서 할까요?</p>
      <p className="mt-1 text-sm text-ink-soft/60">
        최근 AI Search 대화가 있습니다.
        {title && <span className="ml-1 font-medium text-ink-soft/80">「{title}」</span>}
      </p>
      <p className="mt-0.5 font-mono text-[11px] text-ink-soft/40">
        메시지 {messageCount}개 · {new Date(updatedAt).toLocaleDateString('ko-KR')}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={resume}
          disabled={pending}
          className="rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
        >
          이어서 하기
        </button>
        <button
          type="button"
          onClick={startNew}
          disabled={pending}
          className="rounded-xl border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold text-ink-soft/75 transition hover:border-brand-300 hover:text-signal disabled:opacity-50"
        >
          {pending ? '정리 중…' : '새로 시작하기'}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="rounded-xl border border-ink/15 bg-white px-5 py-2.5 text-sm font-semibold text-ink-soft/75 transition hover:border-brand-300 hover:text-signal disabled:opacity-50"
        >
          내보낸 대화 불러오기
        </button>
      </div>

      {notice && <p className="mt-2 text-[11px] text-rose-600">{notice}</p>}

      <p className="mt-2 text-[11px] text-ink-soft/40">
        새로 시작해도 이전 대화는 남습니다. 내보내기 한 .json 파일은 언제든 다시 불러올 수 있습니다.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        multiple
        hidden
        onChange={(e) => {
          importSessions(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
