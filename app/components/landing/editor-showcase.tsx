'use client';

// 랜딩 "몰입형 온라인 코드 에디터" 섹션의 실제 클릭 가능한 데모.
// 라이트 섹션 위에 놓이는 브릴리언트식 프레임 카드 — 내부는 실제 에디터처럼 다크.
// 좌측 패널의 탭(문제사항/문제분석/시도횟수/DebateAI)을 클릭하면 콘텐츠가 전환된다.
import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';

type Tab = 'problem' | 'analysis' | 'attempts' | 'debate';
type Lang = 'ko' | 'en';

const COPY: Record<Lang, {
  tabs: Record<Tab, string>;
  problemTitle: string;
  problemLimits: string;
  problemDesc: string;
  problemTags: string[];
  analysisTitle: string;
  analysisRows: { label: string; value: string; tone: 'ok' | 'warn' | 'plain' }[];
  analysisHint: string;
  attemptsTitle: string;
  attempts: { label: string; result: string; pass: boolean }[];
  attemptsNote: string;
  debateAi: string;
  debateUser: string;
  debateTyping: string;
  openEditor: string;
  codeComment: string;
}> = {
  ko: {
    tabs: { problem: '문제사항', analysis: '문제분석', attempts: '시도횟수', debate: 'DebateAI' },
    problemTitle: 'Q. 두 수의 합 찾기 (Two Sum)',
    problemLimits: '제한 시간: 2초 | 메모리: 128MB',
    problemDesc: '정수 배열 nums와 타겟 target이 주어졌을 때, 더해서 타겟이 되는 두 수의 고유 인덱스를 반환하세요.',
    problemTags: ['#해시', '#배열', '#입문'],
    analysisTitle: '정적 분석 결과',
    analysisRows: [
      { label: '예상 시간 복잡도', value: 'O(n)', tone: 'ok' },
      { label: '감지된 자료구조', value: '해시 맵', tone: 'plain' },
      { label: '중첩 반복문', value: '없음', tone: 'ok' },
      { label: '엣지 케이스 가드', value: '미탐지', tone: 'warn' },
    ],
    analysisHint: '💡 면접관이 "빈 배열 처리"를 파고들 확률이 높습니다.',
    attemptsTitle: '제출 기록 (3회)',
    attempts: [
      { label: '#1 · 이중 루프', result: 'FAIL 3/5', pass: false },
      { label: '#2 · 정렬 + 투포인터', result: 'FAIL 4/5', pass: false },
      { label: '#3 · 해시 맵', result: 'PASS 5/5', pass: true },
    ],
    attemptsNote: 'PASS 즉시 면접 모드가 열립니다.',
    debateAi: 'AI: 해시 맵의 공간 복잡도를 희생한 이유가 있나요?',
    debateUser: '나: 시간이 O(n²)→O(n)으로 줄어 트레이드오프가 명확합니다.',
    debateTyping: 'DebateAI 입력 중',
    openEditor: '실제 에디터에서 사용해보기 →',
    codeComment: '# 해시 알고리즘 최적화 적용',
  },
  en: {
    tabs: { problem: 'Problem', analysis: 'Analysis', attempts: 'Attempts', debate: 'DebateAI' },
    problemTitle: 'Q. Two Sum',
    problemLimits: 'Time limit: 2s | Memory: 128MB',
    problemDesc: 'Given an integer array nums and a target, return the unique indices of the two numbers that add up to the target.',
    problemTags: ['#hash', '#array', '#beginner'],
    analysisTitle: 'Static Analysis',
    analysisRows: [
      { label: 'Estimated complexity', value: 'O(n)', tone: 'ok' },
      { label: 'Detected structure', value: 'Hash map', tone: 'plain' },
      { label: 'Nested loops', value: 'None', tone: 'ok' },
      { label: 'Edge-case guards', value: 'Missing', tone: 'warn' },
    ],
    analysisHint: '💡 The interviewer will likely dig into "empty array handling."',
    attemptsTitle: 'Submissions (3)',
    attempts: [
      { label: '#1 · Nested loops', result: 'FAIL 3/5', pass: false },
      { label: '#2 · Sort + two pointers', result: 'FAIL 4/5', pass: false },
      { label: '#3 · Hash map', result: 'PASS 5/5', pass: true },
    ],
    attemptsNote: 'Interview mode opens the moment you PASS.',
    debateAi: 'AI: Why did you sacrifice space complexity for the hash map?',
    debateUser: 'Me: Time drops from O(n²) to O(n) — a clear trade-off.',
    debateTyping: 'DebateAI is typing',
    openEditor: 'Try it in the real editor →',
    codeComment: '# hash-based optimization applied',
  },
};

const TONE_CLASS = { ok: 'text-emerald-400', warn: 'text-rose-400', plain: 'text-fg-on-dark-secondary' } as const;

export default function EditorShowcase() {
  const [tab, setTab] = useState<Tab>('problem');
  const { language } = useLanguage();
  const c = COPY[language];
  const tabs = Object.entries(c.tabs) as [Tab, string][];

  return (
    <div className="rounded-[var(--radius-panel)] border border-hairline bg-paper p-2.5 shadow-[0_24px_60px_-24px_rgba(20,21,43,0.25)]">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 md:aspect-[16/9] font-sans">
        {/* 좌측: 클릭 가능한 탭 패널 */}
        <div className="md:col-span-5 bg-[#12141C] rounded-[var(--radius-panel)] border border-white/10 flex flex-col overflow-hidden">
          <div className="flex border-b border-white/10 text-[10px] sm:text-[11px] font-medium text-fg-on-dark-quiet overflow-x-auto" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`px-3 py-3 whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1 ${
                  tab === key
                    ? 'border-b-2 border-brand-400 text-brand-400 font-bold'
                    : 'hover:text-fg-on-dark-secondary'
                }`}
              >
                {label}
                {key === 'debate' && (
                  <span className="w-1 h-1 bg-brand-500 rounded-full animate-pulse motion-reduce:animate-none" />
                )}
              </button>
            ))}
          </div>

          <div className="p-4 flex-grow text-xs text-fg-on-dark-secondary leading-relaxed overflow-y-auto dc-scroll min-h-[180px]">
            {tab === 'problem' && (
              <div className="space-y-2">
                <p className="font-bold text-white text-sm">{c.problemTitle}</p>
                <p className="text-fg-on-dark-quiet text-[10px]">{c.problemLimits}</p>
                <p>{c.problemDesc}</p>
                <div className="pt-1 flex flex-wrap gap-1.5">
                  {c.problemTags.map((t) => (
                    <span key={t} className="font-mono text-[9px] text-fg-on-dark-quiet bg-surface/5 border border-white/10 rounded-full px-2 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {tab === 'analysis' && (
              <div className="space-y-2.5">
                <p className="font-bold text-white text-sm">{c.analysisTitle}</p>
                <div className="space-y-1.5 font-mono text-[10.5px]">
                  {c.analysisRows.map((r) => (
                    <p key={r.label} className="flex justify-between">
                      <span className="text-fg-on-dark-quiet">{r.label}</span>
                      <span className={TONE_CLASS[r.tone]}>{r.value}</span>
                    </p>
                  ))}
                </div>
                <p className="text-[10px] text-brand-400/80 border-l-2 border-brand-400/40 pl-2">{c.analysisHint}</p>
              </div>
            )}

            {tab === 'attempts' && (
              <div className="space-y-2">
                <p className="font-bold text-white text-sm">{c.attemptsTitle}</p>
                <div className="space-y-1 font-mono text-[10.5px]">
                  {c.attempts.map((a) => (
                    <p key={a.label} className="flex justify-between items-center">
                      <span className="text-fg-on-dark-quiet">{a.label}</span>
                      <span className={a.pass ? 'text-emerald-400' : 'text-rose-400'}>{a.result}</span>
                    </p>
                  ))}
                </div>
                <p className="text-[10px] text-fg-on-dark-quiet pt-1">{c.attemptsNote}</p>
              </div>
            )}

            {tab === 'debate' && (
              <div className="space-y-2">
                <div className="bg-rose-500/[0.07] border-l-2 border-rose-500/50 rounded-r px-2.5 py-2 text-rose-300/90">
                  {c.debateAi}
                </div>
                <div className="bg-emerald-500/[0.07] border-l-2 border-emerald-500/50 rounded-r px-2.5 py-2 text-emerald-300/90">
                  {c.debateUser}
                </div>
                <div className="flex items-center gap-1.5 text-fg-on-dark-quiet font-mono text-[10px] pl-1 pt-0.5">
                  {c.debateTyping}
                  <span className="inline-block w-1.5 h-3 bg-brand-500/80 animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            )}
          </div>

          <Link
            href="/problems"
            className="block border-t border-white/10 py-3.5 text-center text-[11px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/10"
          >
            {c.openEditor}
          </Link>
        </div>

        {/* 우측: 에디터 목업 */}
        <div className="md:col-span-7 bg-ink rounded-[var(--radius-panel)] border border-white/10 flex flex-col overflow-hidden text-xs font-mono text-gray-300">
          <div className="flex justify-between items-center px-4 py-2 border-b border-white/10">
            <span className="text-fg-on-dark-quiet text-[10px]">solution.py</span>
            <span className="text-fg-on-dark-quiet text-[9px] uppercase tracking-wider">sandbox</span>
          </div>
          <div className="p-4 flex-grow space-y-1.5 text-[11px] leading-relaxed">
            <p><span className="text-brand-400">def</span> <span className="text-sky-400">twoSum</span>(nums, target):</p>
            <p className="pl-4 text-fg-on-dark-quiet">{c.codeComment}</p>
            <p className={`pl-4 ${tab === 'analysis' ? 'bg-brand-500/10 -mx-1 px-1 rounded' : ''}`}>seen = &#123;&#125;</p>
            <p className="pl-4"><span className="text-brand-400">for</span> i, num <span className="text-brand-400">in</span> <span className="text-sky-400">enumerate</span>(nums):</p>
            <p className="pl-8">diff = target - num</p>
            <p className="pl-8"><span className="text-brand-400">if</span> diff <span className="text-brand-400">in</span> seen:</p>
            <p className={`pl-12 ${tab === 'debate' ? 'bg-emerald-500/10 -mx-1 px-1 rounded' : ''}`}>
              <span className="text-brand-400">return</span> <span className="text-emerald-400">[seen[diff], i]</span>
            </p>
            <p className="pl-8">seen[num] = i</p>
          </div>
          {tab === 'attempts' && (
            <div className="border-t border-white/10 px-4 py-2 text-[10px] flex gap-4">
              <span className="text-fg-on-dark-quiet">CASE #1-5</span>
              <span className="text-emerald-400">ALL PASSED ✓</span>
              <span className="text-fg-on-dark-quiet ml-auto">3ms</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
