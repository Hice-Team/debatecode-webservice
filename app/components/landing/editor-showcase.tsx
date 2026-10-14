'use client';

// 랜딩 "몰입형 온라인 코드 에디터" 섹션의 실제 클릭 가능한 데모.
// 라이트 섹션 위에 놓이는 브릴리언트식 프레임 카드 — 내부는 실제 에디터처럼 다크.
// 좌측 패널의 탭(문제사항/문제분석/시도횟수/DebateAI)을 클릭하면 콘텐츠가 전환된다.
import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';

type Tab = 'problem' | 'analysis' | 'attempts' | 'debate';

interface AnalysisRow {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'plain';
}

interface AttemptRow {
  label: string;
  result: string;
  pass: boolean;
}

interface ShowcaseCopy {
  tabs: Record<Tab, string>;
  problemTitle: string;
  problemLimits: string;
  problemDesc: string;
  problemTags: string[];
  analysisTitle: string;
  analysisRows: AnalysisRow[];
  analysisHint: string;
  attemptsTitle: string;
  attempts: AttemptRow[];
  attemptsNote: string;
  debateAi: string;
  debateUser: string;
  debateTyping: string;
  openEditor: string;
  codeComment: string;
}

const COPY: Record<string, ShowcaseCopy> = {
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
  ja: {
    tabs: { problem: '問題文', analysis: '問題分析', attempts: '試行回数', debate: 'DebateAI' },
    problemTitle: 'Q. 2つの数の和 (Two Sum)',
    problemLimits: '制限時間: 2秒 | メモリ: 128MB',
    problemDesc: '整数配列 nums とターゲット target が与えられたとき、足して target になる2つの数のインデックスを返してください。',
    problemTags: ['#ハッシュ', '#配列', '#入門'],
    analysisTitle: '静的解析結果',
    analysisRows: [
      { label: '予想時間計算量', value: 'O(n)', tone: 'ok' },
      { label: '検出されたデータ構造', value: 'ハッシュマップ', tone: 'plain' },
      { label: '二重ループ', value: 'なし', tone: 'ok' },
      { label: '境界値ガード', value: '未検出', tone: 'warn' },
    ],
    analysisHint: '💡 面接官が「空配列の処理」について深く質問する可能性が高いです。',
    attemptsTitle: '提出履歴 (3回)',
    attempts: [
      { label: '#1 · 二重ループ', result: 'FAIL 3/5', pass: false },
      { label: '#2 · ソート + 2ポインタ', result: 'FAIL 4/5', pass: false },
      { label: '#3 · ハッシュマップ', result: 'PASS 5/5', pass: true },
    ],
    attemptsNote: 'PASS すると直ちに面接モードが開放されます。',
    debateAi: 'AI: ハッシュマップの空間計算量を犠牲にした理由は何ですか？',
    debateUser: '自分: 計算量がO(n²)からO(n)に削減され、明確なトレードオフだからです。',
    debateTyping: 'DebateAI 入力中',
    openEditor: '実際のエディタで体験する →',
    codeComment: '# ハッシュアルゴリズム最適化を適用',
  },
  'zh-CN': {
    tabs: { problem: '题目描述', analysis: '题目分析', attempts: '提交历史', debate: 'DebateAI' },
    problemTitle: 'Q. 两数之和 (Two Sum)',
    problemLimits: '时间限制: 2秒 | 内存: 128MB',
    problemDesc: '给定一个整数数组 nums 和一个目标值 target，请你在该数组中找出和为目标值的那两个整数，并返回它们的数组下标。',
    problemTags: ['#哈希表', '#数组', '#入门'],
    analysisTitle: '静态代码分析',
    analysisRows: [
      { label: '预估时间复杂度', value: 'O(n)', tone: 'ok' },
      { label: '识别出的数据结构', value: '哈希表', tone: 'plain' },
      { label: '嵌套循环', value: '无', tone: 'ok' },
      { label: '边界防御守卫', value: '未检测到', tone: 'warn' },
    ],
    analysisHint: '💡 面试官极可能会深入追问“空数组与极端值处理”。',
    attemptsTitle: '提交记录 (3次)',
    attempts: [
      { label: '#1 · 暴力双重循环', result: 'FAIL 3/5', pass: false },
      { label: '#2 · 排序 + 双指针', result: 'FAIL 4/5', pass: false },
      { label: '#3 · 哈希表优化', result: 'PASS 5/5', pass: true },
    ],
    attemptsNote: 'PASS 后立即开启真实面试对辩模式。',
    debateAi: 'AI: 为什么你选择牺牲空间复杂度来使用哈希表？',
    debateUser: '我: 时间复杂度由 O(n²) 显著降至 O(n)，权衡清晰合理。',
    debateTyping: 'DebateAI 正在输入…',
    openEditor: '前往完整工作区体验 →',
    codeComment: '# 应用哈希算法优化',
  },
  'zh-TW': {
    tabs: { problem: '題目描述', analysis: '題目分析', attempts: '提交歷程', debate: 'DebateAI' },
    problemTitle: 'Q. 兩數之和 (Two Sum)',
    problemLimits: '時間限制: 2秒 | 記憶體: 128MB',
    problemDesc: '給定一個整數陣列 nums 與目標值 target，請找出和為目標值的兩個整數，並回傳它們在陣列中的索引。',
    problemTags: ['#雜湊表', '#陣列', '#入門'],
    analysisTitle: '靜態代碼分析',
    analysisRows: [
      { label: '預估時間複雜度', value: 'O(n)', tone: 'ok' },
      { label: '識別出的資料結構', value: '雜湊表', tone: 'plain' },
      { label: '巢狀迴圈', value: '無', tone: 'ok' },
      { label: '極限邊界守衛', value: '未檢測到', tone: 'warn' },
    ],
    analysisHint: '💡 面試官極可能會深入追問「空陣列與邊界例外處理」。',
    attemptsTitle: '提交紀錄 (3次)',
    attempts: [
      { label: '#1 · 雙層迴圈', result: 'FAIL 3/5', pass: false },
      { label: '#2 · 排序 + 雙指針', result: 'FAIL 4/5', pass: false },
      { label: '#3 · 雜湊表優化', result: 'PASS 5/5', pass: true },
    ],
    attemptsNote: 'PASS 後立即開啟全真面試辯論模式。',
    debateAi: 'AI: 為什麼你選擇犧牲空間複雜度來使用雜湊表？',
    debateUser: '我: 時間複雜度從 O(n²) 大幅降至 O(n)，權衡清晰明確。',
    debateTyping: 'DebateAI 正在輸入…',
    openEditor: '前往完整工作區體驗 →',
    codeComment: '# 套用雜湊演算法最佳化',
  },
};

const TONE_CLASS: Record<'ok' | 'warn' | 'plain', string> = {
  ok: 'text-emerald-400',
  warn: 'text-rose-400',
  plain: 'text-fg-on-dark-secondary',
};

export default function EditorShowcase() {
  const [tab, setTab] = useState<Tab>('problem');
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.ko;
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
                  {c.problemTags.map((t: string) => (
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
                  {c.analysisRows.map((r: AnalysisRow) => (
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
                  {c.attempts.map((a: AttemptRow) => (
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
