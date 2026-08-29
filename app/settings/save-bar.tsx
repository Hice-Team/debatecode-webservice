'use client';

// 설정의 저장 흐름을 한곳에서 맡는다.
//
// 예전에는 항목마다 인라인으로 저장됐다. 무엇이 이미 저장됐고 무엇이 아직인지가
// 화면에 남지 않아, 바꾸고 나서도 "이거 저장된 건가"를 확인할 방법이 없었다.
// 지금은 ① 바꾸면 하단 바가 올라오고 ② 그 바에서만 저장하며 ③ 저장하지 않고
// 떠나려 하면 붙잡는다.
//
// 저장 자체는 각 구역의 폼(서버 액션)이 그대로 한다 — 이 바는 그 폼을 대신 눌러 줄 뿐이다.
// 저장 로직을 여기로 끌어오면 구역마다 다른 검증·에러 표시를 다시 만들어야 한다.
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

interface SaveBarApi {
  dirty: boolean;
  /** 이 폼을 저장 대상으로 등록한다 — 하단 바의 [저장]이 이 폼을 제출한다 */
  register: (form: HTMLFormElement | null) => void;
  markDirty: () => void;
  markClean: () => void;
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
 * <form {...useSettingsForm()}> 처럼 펴 넣으면 입력이 바뀌는 순간 하단 바가 올라오고,
 * 제출이 끝나면 내려간다.
 */
export function useSettingsForm() {
  const { register, markDirty, markClean } = useSaveBar();
  return {
    ref: register,
    onChange: markDirty,
    onInput: markDirty,
    onSubmit: markClean,
  };
}

export default function SettingsSaveBar({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const register = useCallback((form: HTMLFormElement | null) => {
    formRef.current = form;
  }, []);
  const markDirty = useCallback(() => setDirty(true), []);
  const markClean = useCallback(() => setDirty(false), []);

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
    () => ({ dirty, register, markDirty, markClean, confirmLeave }),
    [dirty, register, markDirty, markClean, confirmLeave],
  );

  return (
    <Ctx.Provider value={api}>
      {children}

      {/* 하단 저장 바 — 바꾼 것이 있을 때만 올라온다.
          화면 아래 고정이라 어느 구역을 보고 있든 같은 자리에 있다. */}
      <div
        aria-hidden={!dirty}
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[opacity,transform] duration-[var(--duration-enter)] ${
          dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <div
          role="status"
          className={`pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-full border border-hairline bg-surface px-5 py-3 shadow-[0_12px_32px_rgba(8,9,26,0.18)] ${
            dirty ? '' : 'invisible'
          }`}
        >
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <p className="min-w-0 flex-1 text-sm text-fg">저장하지 않은 변경 사항이 있습니다.</p>
          <button
            type="button"
            onClick={() => {
              formRef.current?.reset();
              setDirty(false);
            }}
            className="min-h-9 shrink-0 rounded-full px-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            className="min-h-9 shrink-0 rounded-full bg-signal px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            변경 사항 저장
          </button>
        </div>
      </div>
    </Ctx.Provider>
  );
}
