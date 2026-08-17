'use client';

// 문제분석 탭 상단의 "문제가 이해 안 된다면?" 카드.
//
// 난이도마다 할 수 있는 일이 다르므로 버튼도 달라진다.
//   쉬움    debateAI를 바로 쓸 수 있다 → 질문 시드를 들고 챗봇으로
//   보통    AI가 잠겨 있다 → 난이도를 낮출지 먼저 묻고, 스스로 점검할 실마리를 준다
//   어려움  빈 코드라 막막함의 결이 다르다 → 설계부터 되짚게 하고, 낮추기는 보조 버튼으로
//
// 난이도를 바꿀 수 없는 자리(실전 모의고사·비로그인)에서는 onSwitchToEasy가 없다.
// 그때는 낮추기를 권하는 대신 왜 바꿀 수 없는지를 설명한다(lockedDesc).
import type { ScaffoldLevel } from '@/app/lib/scaffold';

interface CtaCopy {
  title: string;
  desc: string;
  primary: string;
  /** 눌렀을 때 챗봇에 미리 채워 넣을 질문 — 없으면 난이도 전환 버튼으로 동작한다 */
  seed?: string;
  /** 난이도를 바꿀 수 없을 때의 설명 — seed가 있는 난이도(쉬움)에는 필요 없다 */
  lockedDesc?: string;
  /** 보조 안내 — 스스로 해볼 수 있는 것 */
  hint: string;
}

const COPY: Record<ScaffoldLevel, CtaCopy> = {
  easy: {
    title: '문제가 이해되지 않나요?',
    desc: '쉬움 난이도에서는 debateAI에게 물어보며 코드를 작성할 수 있습니다. 정답 대신 스스로 풀어낼 힌트를 줍니다.',
    primary: 'debateAI에게 물어보기',
    seed: '이 문제가 잘 이해되지 않아요. 문제를 더 쉽게 다시 설명해 주세요.',
    hint: '시작 코드에는 필요한 상수가 이미 정의되어 있습니다.',
  },
  normal: {
    title: 'debateAI 없이 풀어보는 단계입니다',
    desc: '보통 난이도에서는 상수가 정의된 시작 코드만 주어지고 debateAI는 잠깁니다. 도움이 필요하면 쉬움으로 내려 물어볼 수 있습니다.',
    lockedDesc: '보통 난이도에서는 상수가 정의된 시작 코드만 주어지고 debateAI는 잠깁니다. 여기서는 난이도를 바꿀 수 없습니다.',
    primary: '쉬움으로 바꾸고 물어보기',
    hint: '먼저 입력·출력 예시를 손으로 한 번 따라가 보세요. 막히는 지점이 곧 질문이 됩니다.',
  },
  hard: {
    title: '빈 코드에서 시작하는 단계입니다',
    desc: '어려움 난이도에서는 시작 코드도 debateAI도 없습니다. 설계부터 직접 세워야 합니다.',
    lockedDesc: '어려움 난이도에서는 시작 코드도 debateAI도 없습니다. 여기서는 난이도를 바꿀 수 없어 설계부터 직접 세워야 합니다.',
    primary: '쉬움으로 바꾸고 물어보기',
    hint: '함수 시그니처 → 자료구조 선택 → 반복 구조 → 엣지 케이스 순으로 적어 내려가 보세요.',
  },
};

const LEVEL_TONE: Record<ScaffoldLevel, string> = {
  easy: 'border-brand-400/30 from-brand-600/20 to-brand-500/5',
  normal: 'border-sky-400/25 from-sky-500/15 to-sky-500/[0.03]',
  hard: 'border-rose-400/25 from-rose-500/15 to-rose-500/[0.03]',
};

export default function AnalysisCta({
  level,
  onAsk,
  onSwitchToEasy,
}: {
  level: ScaffoldLevel;
  onAsk: (seed: string) => void;
  /** 없으면 난이도를 바꿀 수 없는 자리 — 낮추기 버튼을 감춘다 */
  onSwitchToEasy?: () => void;
}) {
  const copy = COPY[level];
  // 낮추기가 막힌 자리에서는 설명도 그에 맞게 바꾼다
  const locked = !copy.seed && !onSwitchToEasy;

  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${LEVEL_TONE[level]}`}>
      <p className="text-sm font-bold text-white">{copy.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/55">{(locked && copy.lockedDesc) || copy.desc}</p>

      <p className="mt-2.5 border-l-2 border-white/15 pl-2 text-[11px] leading-relaxed text-white/45">{copy.hint}</p>

      {!locked && (
        <button
          type="button"
          onClick={() => (copy.seed ? onAsk(copy.seed) : onSwitchToEasy?.())}
          className="mt-3 rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
        >
          {copy.primary}
        </button>
      )}
    </div>
  );
}
