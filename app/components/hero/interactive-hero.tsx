'use client';

// 인터랙티브 히어로 — 브릴리언트식 센터 정렬 라이트 히어로.
// 상단: 배지 → 대형 헤드라인 → 설명 → CTA 2종.
// 하단: 자동 재생 "디베이트 루프" 패널(코드 타이핑 → 케이스 통과 →
// AI 지적(rose) → 사용자 반박(emerald) → 리팩터링 → 방어 성공률 틱업).
// prefers-reduced-motion 시 최종 프레임을 정적으로 렌더한다.

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';

interface Scenario {
  file: string;
  code: string[];
  refactored: string[];
  aiLine: string;
  userLine: string;
  scoreFrom: number;
  scoreTo: number;
}

type Lang = 'ko' | 'en';

const SCENARIOS_BY_LANG: Record<Lang, Scenario[]> = {
  ko: [
    {
      file: 'review / solution.py',
      code: [
        'def solution(nums, target):',
        '    for i in range(len(nums)):',
        '        for j in range(i+1, len(nums)):',
        '            if nums[i]+nums[j] == target:',
        '                return [i, j]',
      ],
      refactored: [
        'def solution(nums, target):',
        '    seen = {}',
        '    for i, n in enumerate(nums):',
        '        if target - n in seen:',
        '            return [seen[target-n], i]',
        '        seen[n] = i',
      ],
      aiLine: '# AI: 이중 루프라 O(N²)인데, 입력이 10⁶개여도 통과할까요?',
      userLine: '# 나: 해시 맵으로 한 번의 순회, O(N)까지 줄이겠습니다',
      scoreFrom: 72,
      scoreTo: 91,
    },
    {
      file: 'review / fibonacci.py',
      code: [
        'def solution(n):',
        '    if n < 2:',
        '        return n',
        '    return solution(n-1) + solution(n-2)',
      ],
      refactored: [
        'def solution(n):',
        '    a, b = 0, 1',
        '    for _ in range(n):',
        '        a, b = b, a + b',
        '    return a',
      ],
      aiLine: '# AI: 중복 계산이 지수적으로 폭발합니다. n=40이면요?',
      userLine: '# 나: 바텀업 DP로 바꾸면 O(N)에 상수 공간이면 충분합니다',
      scoreFrom: 64,
      scoreTo: 95,
    },
  ],
  en: [
    {
      file: 'review / solution.py',
      code: [
        'def solution(nums, target):',
        '    for i in range(len(nums)):',
        '        for j in range(i+1, len(nums)):',
        '            if nums[i]+nums[j] == target:',
        '                return [i, j]',
      ],
      refactored: [
        'def solution(nums, target):',
        '    seen = {}',
        '    for i, n in enumerate(nums):',
        '        if target - n in seen:',
        '            return [seen[target-n], i]',
        '        seen[n] = i',
      ],
      aiLine: '# AI: Nested loops make this O(N²). Will it pass with 10⁶ inputs?',
      userLine: '# Me: With a hash map, a single pass brings it down to O(N)',
      scoreFrom: 72,
      scoreTo: 91,
    },
    {
      file: 'review / fibonacci.py',
      code: [
        'def solution(n):',
        '    if n < 2:',
        '        return n',
        '    return solution(n-1) + solution(n-2)',
      ],
      refactored: [
        'def solution(n):',
        '    a, b = 0, 1',
        '    for _ in range(n):',
        '        a, b = b, a + b',
        '    return a',
      ],
      aiLine: '# AI: Redundant calls explode exponentially. What about n=40?',
      userLine: '# Me: Bottom-up DP gets O(N) time with constant space',
      scoreFrom: 64,
      scoreTo: 95,
    },
  ],
};

const HERO_COPY: Record<Lang, {
  badge: string;
  titleA: string;
  titleB: string;
  titleHighlight: string;
  titleC: string;
  desc: string;
  ctaPrimary: string;
  ctaSecondary: string;
  defenseRate: string;
  proofs: string[];
  replayNote: string;
  replayLink: string;
}> = {
  ko: {
    badge: '국내 최초 대화형 온라인 저지 · 100% 무료',
    titleA: '코드를 맞혔다면,',
    titleB: '이제 ',
    titleHighlight: '논증',
    titleC: '할 차례입니다.',
    desc: '정답 여부만 알려주는 채점은 이제 그만. Debate Code는 AI와의 실시간 토론으로 코드 뒤에 숨은 논리를 말로 방어하는, 진짜 기술 면접 감각을 길러줍니다.',
    ctaPrimary: '무료로 시작하기',
    ctaSecondary: '문제 둘러보기',
    defenseRate: '방어 성공률',
    proofs: ['결제 · 구독 없음', '매주 월요일 새 문제 10개', 'AI 없이도 채점 가능'],
    replayNote: '실제 서비스 흐름을 재생 중 — ',
    replayLink: '지금 직접 면접장에 입장하세요',
  },
  en: {
    badge: "Korea's first conversational online judge · 100% free",
    titleA: 'You solved the problem.',
    titleB: 'Now it’s time to ',
    titleHighlight: 'defend',
    titleC: ' it.',
    desc: 'Judging that only says pass or fail is over. Debate Code builds real technical-interview instincts through live debates with AI, defending the logic behind your code out loud.',
    ctaPrimary: 'Get started — free',
    ctaSecondary: 'Browse problems',
    defenseRate: 'Defense rate',
    proofs: ['No payments, no subscriptions', '10 new problems every Monday', 'Judge works without AI'],
    replayNote: 'Replaying the actual service flow — ',
    replayLink: 'enter the interview room now',
  },
};

type Phase = 'typing' | 'tests' | 'question' | 'answer' | 'refactor' | 'score' | 'hold';

const PY_KEYWORDS = /\b(def|for|if|in|return|while|not|and|or|else|elif|range|enumerate|len)\b/g;

function CodeLine({ text }: { text: string }) {
  // 간단한 파이썬 토큰 하이라이트
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PY_KEYWORDS)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} className="text-brand-400">
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

export default function InteractiveHero() {
  const reduced = usePrefersReducedMotion();
  const { language } = useLanguage();
  const copy = HERO_COPY[language];
  const scenarios = SCENARIOS_BY_LANG[language];
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('typing');
  const [charCount, setCharCount] = useState(0);
  const [casesShown, setCasesShown] = useState(0);
  const [aiChars, setAiChars] = useState(0);
  const [userChars, setUserChars] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [refactored, setRefactored] = useState(false);

  const sc = scenarios[scenarioIdx];
  const codeJoined = sc.code.join('\n');

  // ---- 타임라인 엔진 ----
  useEffect(() => {
    if (reduced) return;
    let t: ReturnType<typeof setTimeout>;

    if (phase === 'typing') {
      if (charCount < codeJoined.length) {
        t = setTimeout(() => setCharCount((c) => c + 2), 16);
      } else {
        t = setTimeout(() => setPhase('tests'), 400);
      }
    } else if (phase === 'tests') {
      if (casesShown < 3) {
        t = setTimeout(() => setCasesShown((c) => c + 1), 380);
      } else {
        t = setTimeout(() => setPhase('question'), 600);
      }
    } else if (phase === 'question') {
      if (aiChars < sc.aiLine.length) {
        t = setTimeout(() => setAiChars((c) => c + 2), 22);
      } else {
        t = setTimeout(() => setPhase('answer'), 700);
      }
    } else if (phase === 'answer') {
      if (userChars < sc.userLine.length) {
        t = setTimeout(() => setUserChars((c) => c + 2), 22);
      } else {
        t = setTimeout(() => setPhase('refactor'), 600);
      }
    } else if (phase === 'refactor') {
      t = setTimeout(() => {
        setRefactored(true);
        setScore(sc.scoreFrom);
        setPhase('score');
      }, 900);
    } else if (phase === 'score') {
      if (score !== null && score < sc.scoreTo) {
        t = setTimeout(() => setScore((s) => (s ?? 0) + 1), 55);
      } else {
        t = setTimeout(() => setPhase('hold'), 300);
      }
    } else if (phase === 'hold') {
      t = setTimeout(() => {
        // 다음 시나리오로 리셋
        setScenarioIdx((i) => (i + 1) % scenarios.length);
        setPhase('typing');
        setCharCount(0);
        setCasesShown(0);
        setAiChars(0);
        setUserChars(0);
        setScore(null);
        setRefactored(false);
      }, 3200);
    }
    return () => clearTimeout(t);
  }, [phase, charCount, casesShown, aiChars, userChars, score, reduced, codeJoined.length, sc, scenarios.length]);

  // reduced-motion: 최종 프레임 고정
  const showTyped = reduced ? codeJoined : codeJoined.slice(0, charCount);
  const displayLines = (reduced || refactored ? sc.refactored : showTyped.split('\n')) as string[];
  const visibleCases = reduced ? 3 : casesShown;
  const aiText = reduced ? sc.aiLine : sc.aiLine.slice(0, aiChars);
  const userText = reduced ? sc.userLine : sc.userLine.slice(0, userChars);
  const displayScore = reduced ? sc.scoreTo : score;
  const showAi = reduced || phase === 'question' || phase === 'answer' || phase === 'refactor' || phase === 'score' || phase === 'hold';
  const showUser = reduced || phase === 'answer' || phase === 'refactor' || phase === 'score' || phase === 'hold';

  return (
    <section className="relative overflow-hidden bg-white pt-20 pb-14 sm:pt-28 sm:pb-20">
      {/* 은은한 브랜드 배경 워시 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            'radial-gradient(700px 320px at 50% -80px, rgba(91,76,240,0.10), transparent 70%)',
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-xs sm:text-sm font-semibold text-brand-700">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse motion-reduce:animate-none" />
          {copy.badge}
        </span>

        <h1 className="mt-6 font-display text-4xl sm:text-6xl font-bold tracking-tight leading-[1.12] text-ink-soft">
          {copy.titleA}
          <br />
          {copy.titleB}
          <span className="text-brand-600">{copy.titleHighlight}</span>
          {copy.titleC}
        </h1>

        <p className="mt-6 mx-auto max-w-2xl text-base sm:text-lg text-ink-soft/60 leading-relaxed">
          {copy.desc}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row justify-center items-center gap-3.5">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-9 py-4 bg-brand-600 text-white text-base font-bold rounded-full hover:bg-brand-500 active:scale-[0.98] transition text-center shadow-[0_8px_24px_rgba(69,49,217,0.28)]"
          >
            {copy.ctaPrimary}
          </Link>
          <Link
            href="/problems"
            className="w-full sm:w-auto px-9 py-4 rounded-full border border-ink/15 bg-white text-base font-semibold text-ink-soft hover:bg-paper active:scale-[0.98] transition text-center"
          >
            {copy.ctaSecondary}
          </Link>
        </div>

        {/* 신뢰 지표 스트립 */}
        <ul className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm text-ink-soft/55">
          {copy.proofs.map((p) => (
            <li key={p} className="inline-flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4 text-emerald-500" fill="none" aria-hidden>
                <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* ---- 자동 재생 디베이트 패널 (히어로 비주얼) ---- */}
      <div className="relative max-w-3xl mx-auto px-6 sm:px-8 mt-14">
        <div className="rounded-3xl border border-ink/10 bg-paper p-2.5 shadow-[0_24px_60px_-24px_rgba(20,21,43,0.25)]">
          <div className="relative bg-ink border border-ink/40 rounded-2xl overflow-hidden font-mono text-[12.5px]">
            {/* 타이틀바 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
              <span className="text-white/40 text-[11px]">{sc.file}</span>
              <span className="flex items-center gap-3">
                {displayScore !== null && (
                  <span className="text-[10px] text-white/50">
                    {copy.defenseRate}{' '}
                    <span className={displayScore >= 85 ? 'text-emerald-400 font-bold' : 'text-brand-300 font-bold'}>
                      {displayScore}%
                    </span>
                  </span>
                )}
                <span className="text-[10px] text-brand-300/90 tracking-wider">DEBATE MODE</span>
              </span>
            </div>

            {/* 코드 영역 */}
            <div className="min-h-[168px] py-2 text-left">
              {displayLines.map((line, i) => (
                <div key={i} className={`flex ${refactored && !reduced ? 'animate-[dc-blink_0.6s_1]' : ''}`}>
                  <span className="w-10 shrink-0 text-right pr-3 py-0.5 text-white/20 select-none">{i + 1}</span>
                  <pre className={`py-0.5 pr-4 whitespace-pre ${refactored || reduced ? 'text-emerald-100/90' : 'text-white/80'}`}>
                    <CodeLine text={line} />
                    {!reduced && phase === 'typing' && i === displayLines.length - 1 && (
                      <span className="inline-block w-2 h-3.5 bg-brand-400/80 align-middle ml-0.5 animate-pulse" />
                    )}
                  </pre>
                </div>
              ))}
            </div>

            {/* 테스트 케이스 */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-white/10 text-[11px] min-h-[33px]">
              {(reduced || phase !== 'typing') &&
                [1, 2, 3].map((n) => (
                  <span key={n} className={`transition-opacity ${n <= visibleCases ? 'opacity-100' : 'opacity-0'}`}>
                    <span className="text-white/40">CASE #{n}</span> <span className="text-emerald-400">✓</span>
                  </span>
                ))}
              {(reduced || visibleCases === 3) && (
                <span className="ml-auto text-emerald-400/80">ALL PASSED</span>
              )}
            </div>

            {/* 디베이트: AI 지적 (rose) / 사용자 반박 (emerald) */}
            <div className="border-t border-white/10 min-h-[76px] text-left">
              {showAi && (
                <div className="flex bg-rose-500/[0.07] border-l-2 border-rose-500/50">
                  <span className="w-10 shrink-0 text-right pr-3 py-2 text-white/20 select-none">−</span>
                  <p className="py-2 pr-4 text-rose-300/90">
                    {aiText}
                    {!reduced && phase === 'question' && aiChars < sc.aiLine.length && (
                      <span className="inline-block w-2 h-3.5 bg-rose-400/70 align-middle ml-0.5 animate-pulse" />
                    )}
                  </p>
                </div>
              )}
              {showUser && (
                <div className="flex bg-emerald-500/[0.07] border-l-2 border-emerald-500/50">
                  <span className="w-10 shrink-0 text-right pr-3 py-2 text-white/20 select-none">+</span>
                  <p className="py-2 pr-4 text-emerald-300/90">
                    {userText}
                    {!reduced && phase === 'answer' && userChars < sc.userLine.length && (
                      <span className="inline-block w-2 h-3.5 bg-emerald-400/70 align-middle ml-0.5 animate-pulse" />
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-[13px] text-ink-soft/45">
          {copy.replayNote}
          <Link href="/problems" className="font-semibold text-brand-600 hover:text-brand-500 underline underline-offset-2">
            {copy.replayLink}
          </Link>
        </p>
      </div>
    </section>
  );
}
