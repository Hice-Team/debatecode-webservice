'use client';

// 설정의 저장 흐름을 한곳에서 맡는다.
//
// 예전에는 항목마다 인라인으로 저장됐다. 무엇이 이미 저장됐고 무엇이 아직인지가
// 화면에 남지 않아, 바꾸고 나서도 "이거 저장된 건가"를 확인할 방법이 없었다.
// 지금은 ① 바꾸면 하단 바가 올라오고 ② 그 바에서만 저장하며 ③ 저장이 끝나면
// 같은 자리에서 결과를 알리고 ④ 저장하지 않고 떠나려 하면 붙잡는다.
//
// 저장 자체는 각 구역의 폼(서버 액션)이 그대로 한다 — 이 바는 그 폼을 대신 눌러 주고
// 결과를 모아 보여 줄 뿐이다. 저장 로직을 여기로 끌어오면 구역마다 다른 검증·에러
// 표시를 다시 만들어야 한다.
//
// 폼은 **여러 개**가 등록될 수 있다. 한 화면에 폼이 둘인 구역(프로필·개인정보)이 있고,
// 예전에는 나중에 등록된 하나만 저장돼 다른 하나는 조용히 버려졌다.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

/** 설정 서버 액션들이 공통으로 돌려주는 모양. */
export interface SettingsResult {
  saved?: boolean;
  errors?: { form?: string[] } & Record<string, string[] | undefined>;
}

type Outcome = { ok: boolean; message: string } | null;

interface SaveBarApi {
  dirty: boolean;
  /** 이 폼을 저장 대상으로 등록한다 — 하단 바의 [저장]이 등록된 폼을 제출한다 */
  register: (form: HTMLFormElement | null) => void;
  markDirty: () => void;
  markClean: () => void;
  /** 저장 결과를 하단 바에 띄운다 */
  report: (outcome: Exclude<Outcome, null>) => void;
  /**
   * 저장하지 않은 변경이 있으면 사용자에게 묻는다.
   * 계속해도 좋다면 true. 설정 카테고리를 옮길 때처럼 앱 안에서의 이동에 쓴다.
   */
  confirmLeave: () => boolean;
}

const Ctx = createContext<SaveBarApi | null>(null);

export function useSaveBar(): SaveBarApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSaveBar는 SettingsSaveBar 안에서만 쓸 수 있습니다.');
  return ctx;
}

/**
 * 설정 폼에 붙이는 훅.
 *
 *   <form action={formAction} {...useSettingsForm({ result: state, pending })}>
 *
 * 입력이 바뀌는 순간 하단 바가 올라오고, 저장이 끝나면 그 자리에서 결과를 알린다.
 * `result`를 넘기지 않아도 등록과 dirty 표시는 그대로 동작한다 — 서버 액션을 쓰지 않는
 * 구역(브라우저에만 저장하는 설정)도 같은 바를 쓸 수 있어야 하기 때문이다.
 */
export function useSettingsForm(options?: { result?: SettingsResult; pending?: boolean }) {
  const { register, markDirty, markClean, report } = useSaveBar();
  const router = useRouter();

  const result = options?.result;
  const pending = options?.pending ?? false;

  // 서버 액션이 끝나는 순간을 잡는다. useActionState는 "끝났다"는 콜백을 주지 않으므로
  // pending이 true→false로 떨어지는 지점을 직접 본다.
  const wasPending = useRef(false);
  useEffect(() => {
    const finished = wasPending.current && !pending;
    wasPending.current = pending;
    if (!finished || !result) return;

    const failure = result.errors?.form?.[0];
    if (failure) {
      report({ ok: false, message: failure });
      return;
    }
    if (result.saved) {
      report({ ok: true, message: '저장했습니다.' });
      markClean();
      // 저장한 값이 화면에 곧바로 보이게 한다. 서버 컴포넌트가 그리는 값(요약 줄,
      // 다른 구역의 표시)은 다시 그리지 않으면 저장 전 값이 그대로 남는다.
      router.refresh();
    }
  }, [pending, result, report, markClean, router]);

  return {
    ref: register,
    onChange: markDirty,
    onInput: markDirty,
  };
}

/** 결과 표시가 스스로 사라지기까지 — 읽을 만큼은 있고, 남아서 잔소리가 되지는 않는 길이. */
const OUTCOME_MS = 3200;

export default function SettingsSaveBar({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  // 한 화면에 폼이 여럿일 수 있다 — 등록된 것을 전부 들고 있다가 함께 제출한다
  const formsRef = useRef<Set<HTMLFormElement>>(new Set());

  const register = useCallback((form: HTMLFormElement | null) => {
    // React는 언마운트 때 null로 한 번 더 부른다. 그때 무엇을 빼야 할지 알 수 없으므로
    // 살아 있는 폼만 남기는 방식으로 정리한다(document에서 떨어진 것은 버린다).
    if (form) formsRef.current.add(form);
    else for (const f of formsRef.current) if (!f.isConnected) formsRef.current.delete(f);
  }, []);

  const markDirty = useCallback(() => {
    setDirty(true);
    setOutcome(null); // 다시 고치기 시작했으면 지난 결과는 더 볼 이유가 없다
  }, []);
  const markClean = useCallback(() => setDirty(false), []);
  const report = useCallback((next: Exclude<Outcome, null>) => setOutcome(next), []);

  // 결과 표시는 스스로 사라진다 — 남겨 두면 다음에 무엇을 했는지와 섞인다
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), OUTCOME_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  // 탭을 닫거나 주소를 바꿀 때 — 브라우저가 대신 물어봐 준다.
  // 문구는 브라우저가 정하고 바꿀 수 없다(스팸 방지). 그래도 붙잡는 것 자체가 중요하다.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const confirmLeave = useCallback(() => {
    if (!dirty) return true;
    const ok = window.confirm('저장하지 않은 변경 사항이 있습니다. 저장하지 않고 이동할까요?');
    if (ok) setDirty(false);
    return ok;
  }, [dirty]);

  const api = useMemo<SaveBarApi>(
    () => ({ dirty, register, markDirty, markClean, report, confirmLeave }),
    [dirty, register, markDirty, markClean, report, confirmLeave],
  );

  function saveAll() {
    // 살아 있는 폼만 제출한다 — 카테고리를 옮기면 이전 화면의 폼은 떨어져 나가 있다
    for (const form of formsRef.current) {
      if (form.isConnected) form.requestSubmit();
    }
  }

  function resetAll() {
    for (const form of formsRef.current) if (form.isConnected) form.reset();
    setDirty(false);
  }

  const visible = dirty || outcome !== null;

  return (
    <Ctx.Provider value={api}>
      {children}

      {/* 하단 바 — 바꾼 것이 있거나 방금 저장했을 때만 올라온다.
          화면 아래 고정이라 어느 구역을 보고 있든 같은 자리에 있다. */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[opacity,transform] duration-[var(--duration-enter)] ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-full border bg-surface px-5 py-3 shadow-[0_12px_32px_rgba(8,9,26,0.18)] ${
            visible ? '' : 'invisible'
          } ${outcome && !outcome.ok ? 'border-rose-300' : 'border-hairline'}`}
        >
          {outcome ? (
            <>
              <span
                aria-hidden
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-white ${
                  outcome.ok ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[3]" aria-hidden>
                  {outcome.ok ? (
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M12 7v6M12 17h.01" strokeLinecap="round" />
                  )}
                </svg>
              </span>
              <p className={`min-w-0 flex-1 text-sm ${outcome.ok ? 'text-fg' : 'text-rose-700'}`}>
                {outcome.message}
              </p>
              <button
                type="button"
                onClick={() => setOutcome(null)}
                aria-label="알림 닫기"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-paper hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2" aria-hidden>
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <p className="min-w-0 flex-1 text-sm text-fg">저장하지 않은 변경 사항이 있습니다.</p>
              <button
                type="button"
                onClick={resetAll}
                className="min-h-9 shrink-0 rounded-full px-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                되돌리기
              </button>
              <button
                type="button"
                onClick={saveAll}
                className="min-h-9 shrink-0 rounded-full bg-signal px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                변경 사항 저장
              </button>
            </>
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}
