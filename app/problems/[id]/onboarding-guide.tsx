'use client';

// 코드 에디터 최초 진입 온보딩 — 화면의 실제 요소를 하나씩 비추며 설명한다.
//
// 동작 방식:
//   워크스페이스 곳곳에 `data-tour="..."` 를 달아 두고, 각 단계가 그 요소를 찾아
//   getBoundingClientRect()로 위치를 잰다. 그 사각형만 밝게 남기고(스포트라이트)
//   나머지는 어둡게 덮은 뒤, 옆에 설명 말풍선을 띄운다.
//   요소를 찾지 못한 단계(그 모드에서 없는 UI)는 화면 가운데 카드로 대신 보여준다.
//
// 스포트라이트는 하나의 div를 좌표만 바꿔 이동시킨다 — 단계를 넘길 때 부드럽게 미끄러진다.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DISMISS_KEY = 'dc:workspace:onboarding-dismissed';
const SEEN_KEY = 'dc:workspace:onboarding-seen';

export interface TourStep {
  /** 비출 요소의 data-tour 값 — 없으면 화면 가운데 카드로 보여준다 */
  target?: string;
  title: string;
  body: string;
  /** 말풍선을 어느 쪽에 붙일지 — 자리가 부족하면 자동으로 뒤집는다 */
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const WORKSPACE_TOUR: TourStep[] = [
  {
    title: '문제 풀이 화면에 오신 걸 환영합니다',
    body: '왼쪽은 문제와 도구, 오른쪽은 코드 에디터와 실행 결과입니다. 잠깐만 둘러보면 훨씬 편해집니다. 언제든 건너뛸 수 있어요.',
  },
  {
    target: 'tabs',
    side: 'right',
    title: '왼쪽 탭 — 문제부터 메모까지',
    body: '문제사항에서 문제를 읽고, 문제분석에서 지금 코드의 복잡도를 확인합니다. 시도횟수에는 실행 기록이 쌓이고(행을 누르면 그때 코드로 되돌아갑니다), 메모는 떠오른 아이디어를 적어 두는 곳입니다.',
  },
  {
    target: 'mode',
    side: 'bottom',
    title: '풀이 모드 — 무엇을 연습할지 고릅니다',
    body: '시그니처모드는 정답 확인과 해설 중심의 학습 모드입니다. 디베이트모드는 통과 후 AI 면접관이 코드를 파고듭니다. 리팩토링모드는 AI가 만든 결함 코드를 고치는 모드예요. 실전 모의고사에서는 입장 전에 고른 모드가 잠겨 여기서 바뀌지 않습니다.',
  },
  {
    target: 'scaffold',
    side: 'bottom',
    title: '난이도 — 시작 코드와 AI 사용이 갈립니다',
    body: '쉬움은 상수가 정의된 시작 코드에서 debateAI에게 물어보며 작성합니다. 보통은 같은 시작 코드를 혼자 완성하고, 어려움은 빈 코드에서 전부 직접 씁니다. 보통·어려움에서는 debateAI가 잠깁니다.',
  },
  {
    target: 'run',
    side: 'left',
    title: '실행 — 공개 테스트만 빠르게 확인',
    body: '실행은 공개된 테스트 케이스만 돌려 봅니다. 결과는 아래 터미널에 케이스별로 표시되고, 실행할 때마다 시도횟수 탭에 기록이 남습니다.',
  },
  {
    target: 'submit',
    side: 'left',
    title: '제출 — 히든 케이스까지 채점',
    body: '제출은 히든 케이스를 포함한 전체를 채점하고 결과를 저장합니다. 전체 통과하면 모드에 따라 학습 완료 화면이나 AI 면접으로 이어집니다.',
  },
  {
    target: 'debate-tab',
    side: 'right',
    title: 'debateAI — 막힐 때 물어보세요',
    body: '쉬움 난이도에서 열립니다. 문제 설명과 지금 에디터의 코드를 함께 보고 있어서, 정답을 대신 써 주는 대신 스스로 풀어낼 힌트를 줍니다.',
  },
  {
    title: '면접 모드 — 통과가 끝이 아닙니다',
    body: '디베이트모드에서 전체 통과하면 AI 면접관이 등장합니다. 기본 모드는 시간 제한 없이, 엄격 모드는 답변마다 90초 제한으로 진행됩니다. 보이스 모드를 켜면 음성으로 묻고 답할 수 있어요. 준비되면 시작해 보세요!',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 340;
const GAP = 14;

/** 이 브라우저에서 온보딩을 다시 띄우지 않기로 했는지. */
function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === 'yes';
  } catch {
    return false;
  }
}

/** 최초 1회 자동 실행 여부 판단 — "보지 않기"를 체크했으면 영원히 뜨지 않는다. */
export function shouldAutoStart(): boolean {
  try {
    if (isDismissed()) return false;
    return window.localStorage.getItem(SEEN_KEY) !== 'yes';
  } catch {
    return false;
  }
}

export default function OnboardingGuide({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const last = index === steps.length - 1;

  /** 이번 단계가 가리키는 요소의 위치를 잰다. 없으면 null(가운데 카드). */
  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // 화면 밖(숨겨진 탭 등)이면 가운데 카드로 대신한다
    if (r.width === 0 || r.height === 0) {
      setRect(null);
      return;
    }
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM 실측이라 렌더 중에는 알 수 없다
    measure();
  }, [measure]);

  // 창 크기·스크롤이 바뀌면 스포트라이트도 따라간다
  useEffect(() => {
    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [measure]);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, 'yes');
      if (dontShow) window.localStorage.setItem(DISMISS_KEY, 'yes');
    } catch {
      // 저장 실패는 무시 — 다음에 다시 뜨는 것뿐이다
    }
    onClose();
  }, [dontShow, onClose]);

  // 키보드로도 넘긴다 — ← → Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [finish, steps.length]);

  if (!step) return null;

  // 말풍선 위치 — 대상 옆에 붙이되 화면 밖으로 나가지 않게 가둔다
  const cardStyle: React.CSSProperties = (() => {
    if (!rect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    const side = step.side ?? 'bottom';
    const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;

    let top = rect.top + rect.height + GAP;
    let left = rect.left;

    if (side === 'top') top = rect.top - GAP - 200;
    if (side === 'right') {
      top = rect.top;
      left = rect.left + rect.width + GAP;
    }
    if (side === 'left') {
      top = rect.top;
      left = rect.left - CARD_W - GAP;
    }

    // 화면 경계 보정
    left = Math.min(Math.max(GAP, left), vw - CARD_W - GAP);
    top = Math.min(Math.max(GAP, top), vh - 210 - GAP);
    return { top, left };
  })();

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* 어두운 덮개 + 스포트라이트 구멍.
          box-shadow로 바깥을 통째로 덮으면 구멍 하나만 밝게 남길 수 있다. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl border-2 border-brand-400/70 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(6,8,14,0.78), 0 0 24px rgba(125,120,251,0.45)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[#06080E]/78" />
      )}

      {/* 덮개 클릭으로는 닫지 않는다 — 실수로 가이드를 놓치지 않도록 */}
      <div aria-hidden className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* 설명 카드 */}
      <div
        ref={cardRef}
        style={{ ...cardStyle, width: CARD_W }}
        className="absolute max-w-[calc(100vw-2rem)] rounded-2xl border border-white/12 bg-[#12141C] p-5 shadow-2xl shadow-black/60 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-wider text-brand-300">
            {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
          </span>
          {/* 진행 점 — 눌러서 원하는 단계로 바로 갈 수 있다 */}
          <div className="ml-auto flex items-center gap-1">
            {steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}단계로 이동`}
                aria-current={i === index}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-brand-400' : 'w-1.5 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>

        <h2 id="tour-title" className="mt-2.5 text-base font-bold text-white">
          {step.title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{step.body}</p>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[11px] text-white/45 transition-colors hover:text-white/70">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="accent-[#4531d9]"
          />
          앞으로 보지 않기
        </label>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-[11px] font-medium text-white/40 transition-colors hover:text-white/70"
          >
            건너뛰기
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-30"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => (last ? finish() : setIndex((i) => i + 1))}
              className="rounded-lg bg-signal px-3.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-600"
            >
              {last ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
