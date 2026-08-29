'use client';

// 랜딩 본문 — 브릴리언트(brilliant.org)식 라이트 레이아웃.
// 센터 정렬 섹션 헤더 + 라운드 카드 + white/paper 교차 밴드 + 통계 + FAQ + CTA.
// useLanguage 기반 ko/en 국제화. 브랜드 = 워드마크 인디고(#1800AC).
// 디베이트코드는 100% 프리웨어 — 구독/결제 유도 카피는 두지 않는다.

import { useLanguage } from '@/app/context/language-context';
import EditorShowcase from './editor-showcase';
import SearchShowcase from './search-showcase';

type Lang = 'ko' | 'en';

interface Provider {
  tag: string;
  title: string;
  desc: string;
}

interface Faq {
  q: string;
  a: string;
  /**
   * Pro Tier 점검 중일 때만 답변 끝에 `aiProSuspended` 한 줄이 덧붙는다.
   * 점검이 끝나면 PRO_TIER_SUSPENDED만 false로 두면 된다.
   */
  proNote?: boolean;
}

const COPY: Record<Lang, {
  whyEyebrow: string;
  whyTitle: string;
  whyDesc: string;
  features: { icon: string; tint: string; title: string; desc: string }[];
  f1Eyebrow: string;
  f1Title: string;
  f1Desc: string;
  f1Quote: string;
  f1ProvLabel: string;
  f1Providers: Provider[];
  f1AiOptional: string;
  searchEyebrow: string;
  searchTitle: string;
  searchDesc: string;
  searchLimits: { label: string; value: string; note: string }[];
  /** Pro Tier 점검 안내 — proNote가 붙은 FAQ 답변 끝에 덧붙는다 */
  aiProSuspended: string;
  f2Eyebrow: string;
  f2Title: string;
  f2Desc: React.ReactNode;
  f3Eyebrow: string;
  f3Title: string;
  f3Desc: string;
  f4Eyebrow: string;
  f4Title: string;
  f4Desc: string;
  f4CompaniesNote: string;
  f4Mou: string;
  supported: string;
  comingSoon: string;
  allLangs: string;
  allLangsNote: string;
  companiesLabel: string;
  osEyebrow: string;
  osTitle: string;
  osDesc: string;
  osPoints: { title: string; desc: string }[];
  osWeekly: string;
  stats: { value: string; label: string }[];
  faqTitle: string;
  faqs: Faq[];
  bannerTitle: string;
  bannerDesc: string;
  bannerCta: string;
  caseHeader: [string, string, string, string];
}> = {
  ko: {
    whyEyebrow: '왜 Debate Code인가요',
    whyTitle: '풀고, 반박하고, 성장하는 학습',
    whyDesc: '문제 풀이에서 멈추지 않습니다. 코드를 논증하는 과정까지가 진짜 학습입니다.',
    features: [
      { icon: 'λ', tint: 'brand', title: '알고리즘 문제', desc: '기초 문법부터 고급 알고리즘까지, 엄선된 핵심 문제집을 제공합니다.' },
      { icon: '◍', tint: 'rose', title: '대화형 기술 면접', desc: '내가 짠 코드를 기반으로 AI와 반론을 주고받으며 면접을 대비합니다.' },
      { icon: '✎', tint: 'emerald', title: '성장형 커뮤니티', desc: '집단지성을 통해 코드 리뷰를 받고, 모르는 것을 부담 없이 묻고 답합니다.' },
      { icon: '⚑', tint: 'sky', title: '새로운 코딩테스트 대비', desc: '기업별 기출 유형과 실전 모의고사로 AI 채용 트렌드에 맞춘 실전 감각을 극대화합니다.' },
    ],
    f1Eyebrow: 'DebateAI',
    f1Title: '대화형 AI 기술 면접관',
    f1Desc:
      '문제를 맞히더라도 거기서 끝나지 않습니다. 코드를 제출하면 DebateAI가 정답 데이터와 함께 여러분의 코드를 다각도로 분석하고, 시간 복잡도 최적화·예외 처리·메모리 효율성에 대해 날카로운 기술적 반론을 제기합니다. 이에 맞서 자신의 코드 논리를 직접 논증하고 방어하며 진짜 기술 면접 감각을 기를 수 있습니다.',
    f1Quote:
      '"작성하신 O(N²) 정렬 알고리즘은 대용량 데이터에서 치명적일 수 있습니다. 메모리를 추가로 쓰더라도 O(N log N)으로 단축할 아이디어가 있을까요?"',
    f1ProvLabel: 'AI 제공자는 직접 선택합니다',
    f1Providers: [
      { tag: 'BYO Key', title: '내 API 키 연결', desc: 'OpenAI·Anthropic·Google 등 보유한 API 키를 직접 등록해 사용합니다.' },
      { tag: 'MCP', title: 'debateNetwork', desc: 'MCP 서버를 실행해 AI 서비스와 디베이트코드를 안전하게 연동합니다.' },
      { tag: 'Local', title: 'debateBridge', desc: '데스크톱 앱으로 로컬 Ollama 모델을 연결해 완전 오프라인으로 씁니다.' },
    ],
    f1AiOptional: '연결하지 않아도 기본 제공 모델로 바로 시작할 수 있습니다.',
    searchEyebrow: 'AI 검색',
    searchTitle: '막히면 검색하지 말고 물어보세요',
    searchDesc:
      '탭을 여러 개 열어 가며 답을 짜맞출 필요가 없습니다. DeepSeek 모델이 코드와 개념을 함께 읽고 한 자리에서 답합니다.',
    searchLimits: [
      { label: '세션', value: '1개', note: '대화 하나로 이어집니다' },
      { label: '하루', value: '50회', note: '자정에 다시 채워집니다' },
    ],
    aiProSuspended: '지금은 보안 점검으로 Pro Tier 연결을 잠시 닫아 두었습니다. 다시 열리면 공지합니다.',
    f2Eyebrow: '워크스페이스',
    f2Title: '몰입형 온라인 코드 에디터',
    f2Desc: (
      <>
        좌측 패널의 <strong className="text-fg">내비게이션 바</strong>로 문제사항·문제분석·시도횟수·DebateAI
        대화창을 자유롭게 전환하고, 우측 패널의 넓은 <strong className="text-fg">VS Code 스타일 워크스페이스</strong>에서
        문제 분석부터 코딩, 채점, AI 토론까지 하나의 화면 안에서 완벽하게 몰입할 수 있습니다. 아래 탭을 직접 눌러보세요.
      </>
    ),
    f3Eyebrow: '채점 엔진',
    f3Title: '초고속·고정밀 채점 시스템',
    f3Desc:
      '안전하게 격리된 가상 샌드박스 엔진을 바탕으로 제출된 코드를 실시간 실행합니다. 정밀한 테스트 케이스 검증은 물론, 밀리초(ms) 단위의 실행 시간과 킬로바이트(KB) 단위의 메모리 사용량을 산출하여 시간 초과·메모리 초과 같은 미세한 예외까지 정확하게 잡아냅니다.',
    f4Eyebrow: '문제집',
    f4Title: '난이도별 알고리즘부터 기업 코딩테스트까지',
    f4Desc:
      '입문·기초·중급·고급 난이도별 알고리즘 문제를 단계적으로 정복하세요. 여기에 국내 주요 기업의 코딩테스트 출제 경향을 반영한 실전 대비 문제까지 — 알고리즘 기본기와 실전 감각을 한 곳에서 완성합니다.',
    f4CompaniesNote:
      '실제 출제 경향을 분석해 재구성한 변형 문제를 제공합니다. 우선 아래 기업부터 운영하며 지원 범위를 차근차근 확대합니다.',
    f4Mou: '향후 기업과의 MOU를 통해 기출 원본 열람·풀이 지원을 계획하고 있습니다.',
    supported: '지원 중',
    comingSoon: '지원 예정',
    allLangs: '그리고 모든 언어',
    allLangsNote: '결국 모든 프로그래밍 언어를 지원하는 것이 목표입니다 — 계속 추가되고 있습니다.',
    companiesLabel: '기업 코딩테스트 (변형 문제)',
    osEyebrow: 'debateMate',
    osTitle: '모두가 함께 만드는 문제집',
    osDesc:
      '신생 온라인 저지의 숙명인 부족한 문제량을, 커뮤니티의 힘으로 함께 채웁니다. 누구나 직접 알고리즘 문제를 제작해 업로드하고, 심사를 거쳐 실제 서비스에 반영할 수 있습니다.',
    osPoints: [
      { title: '누구나 출제자', desc: '일반 사용자도 알고리즘 문제를 제작해 업로드할 수 있습니다.' },
      { title: '저작권은 제작자에게', desc: '자신이 만든 문제의 저작권을 소유합니다. 디베이트코드에 기증하면 소유권이 이전됩니다.' },
      { title: '심사 후 반영', desc: '제출된 문제는 검수·심사를 거쳐 실제 서비스에 업데이트됩니다.' },
    ],
    osWeekly: '디베이트코드 공식 문제는 매주 월요일 0시에 10개씩 추가됩니다.',
    stats: [
      { value: '₩0', label: '평생 무료 · 결제 없음' },
      { value: '+10', label: '매주 월요일 새 문제' },
      { value: '9+', label: '지원 및 지원 예정 언어' },
    ],
    faqTitle: '자주 묻는 질문',
    faqs: [
      {
        q: '정말 전부 무료인가요?',
        a: '네. Debate Code는 100% 프리웨어입니다. 구독도, 결제도, 프리미엄 플랜도 없습니다. 모든 문제·채점·커뮤니티 기능을 평생 무료로 사용할 수 있습니다.',
      },
      {
        q: 'AI를 연결하지 않아도 쓸 수 있나요?',
        a: '물론입니다. AI 없이도 문제 풀이와 채점 시스템은 그대로 동작합니다. AI 면접 기능을 쓰고 싶다면 내 API 키 연결, debateNetwork(MCP), debateBridge(로컬 Ollama) 중 원하는 방식을 선택하면 됩니다.',
      },
      {
        q: '어떤 AI 모델을 쓸 수 있나요?',
        a: '키를 등록하지 않아도 기본 제공 토큰 제한 모델을 바로 씁니다 — DeepSeek V4, DeepSeek R1, Qwen 3.6, Qwen3-Coder. 추론·빠른 답변·코드·에이전트 용도에 맞춰 고르면 됩니다. 보유한 API 키가 있다면 Pro Tier로 ChatGPT, Gemini, Claude, Grok, Perplexity를 붙일 수 있습니다. 이때 요금은 그 키의 계정으로 청구됩니다. 제공 모델은 업스트림 사정에 따라 바뀔 수 있고, 바뀌면 이 목록도 함께 고칩니다.',
        proNote: true,
      },
      {
        q: 'AI 사용 횟수에 제한이 있나요?',
        a: 'debateAI 탭은 횟수 제한이 없습니다. 다만 운영하면서 비용 부담이 커지면 한도가 생길 수 있고, 그렇게 되기 전에 미리 공지합니다. AI 검색은 하나의 세션에서 하루 50회까지 쓸 수 있고 자정에 다시 채워집니다.',
      },
      {
        q: '어떤 프로그래밍 언어를 지원하나요?',
        a: '현재 Python과 JavaScript를 지원하며 Java, C, C++, C#, TypeScript, Rust, Dart를 순차적으로 추가하고 있습니다. 최종 목표는 모든 언어 지원입니다.',
      },
      {
        q: '문제는 얼마나 자주 추가되나요?',
        a: '공식 문제는 매주 월요일 0시에 10개씩 추가됩니다. 여기에 더해 커뮤니티가 출제하는 debateMate 문제가 심사를 거쳐 수시로 반영됩니다.',
      },
      {
        q: '기업 코딩테스트 문제는 실제 기출인가요?',
        a: '아니요. 실제 출제 경향을 분석해 재구성한 변형 문제입니다. 향후 기업과의 MOU를 통해 기출 원본 열람·풀이 지원을 계획하고 있습니다.',
      },
    ],
    bannerTitle: '혼자 하는 코딩은 이제 그만',
    bannerDesc: 'Debate Code 커뮤니티에서 동료들과 소통하고, 질문을 공유하며 매일 함께 성장하는 즐거움을 느껴보세요.',
    bannerCta: '함께 시작하기',
    caseHeader: ['CASE', 'STATUS', 'TIME', 'MEM'],
  },
  en: {
    whyEyebrow: 'Why Debate Code',
    whyTitle: 'Solve, rebut, and grow',
    whyDesc: "Solving isn't the finish line. Arguing for your code is where real learning happens.",
    features: [
      { icon: 'λ', tint: 'brand', title: 'Algorithm Problems', desc: 'A curated problem set covering everything from basic syntax to advanced algorithms.' },
      { icon: '◍', tint: 'rose', title: 'Conversational Tech Interview', desc: 'Practice interviews by exchanging counterarguments with AI based on the code you wrote.' },
      { icon: '✎', tint: 'emerald', title: 'Growth Community', desc: 'Get code reviews through collective intelligence and ask questions without hesitation.' },
      { icon: '⚑', tint: 'sky', title: 'Coding Test Prep', desc: 'Maximize real-world readiness with company-style problems and mock tests.' },
    ],
    f1Eyebrow: 'DebateAI',
    f1Title: 'Conversational AI Interviewer',
    f1Desc:
      "Solving the problem is just the beginning. When you submit code, DebateAI analyzes it from multiple angles and raises sharp technical challenges about time complexity, edge cases, and memory efficiency. Defend your logic in real time and build genuine technical interview instincts.",
    f1Quote:
      '"Your O(N²) sort could be fatal on large inputs. Any ideas to bring it down to O(N log N), even at the cost of extra memory?"',
    f1ProvLabel: 'You choose the AI provider',
    f1Providers: [
      { tag: 'BYO Key', title: 'Your own API key', desc: 'Register your own OpenAI, Anthropic, or Google API key and use it directly.' },
      { tag: 'MCP', title: 'debateNetwork', desc: 'Run the MCP server locally and connect it securely to Debate Code.' },
      { tag: 'Local', title: 'debateBridge', desc: 'A desktop app that connects a local Ollama model — fully offline.' },
    ],
    f1AiOptional: 'Even without an AI connected, the judging system works exactly the same.',
    searchEyebrow: 'AI Search',
    searchTitle: 'Stuck? Ask instead of searching',
    searchDesc:
      'No more piecing an answer together across ten tabs. DeepSeek models read your code and the concept behind it, and answer in one place.',
    searchLimits: [
      { label: 'Session', value: '1', note: 'One continuous thread' },
      { label: 'Per day', value: '50', note: 'Refills at midnight' },
    ],
    aiProSuspended: 'Pro Tier connections are paused for a security review right now. We will announce it when they reopen.',
    f2Eyebrow: 'Workspace',
    f2Title: 'Immersive Online Code Editor',
    f2Desc: (
      <>
        Switch freely between problem statement, analysis, attempts, and the DebateAI chat via the{' '}
        <strong className="text-fg">left navigation bar</strong>, and stay fully immersed in a wide{' '}
        <strong className="text-fg">VS Code–style workspace</strong> — analysis, coding, judging, and AI debate
        all on one screen. Try clicking the tabs below.
      </>
    ),
    f3Eyebrow: 'Judge Engine',
    f3Title: 'Ultra-Fast, High-Precision Judge',
    f3Desc:
      'Your submissions run in real time inside a safely isolated sandbox engine. Beyond precise test-case validation, it measures execution time in milliseconds and memory in kilobytes, catching subtle failures like TLE and MLE with accuracy.',
    f4Eyebrow: 'Problem Bank',
    f4Title: 'From Tiered Algorithms to Company Coding Tests',
    f4Desc:
      'Master algorithm problems step by step across beginner, basic, intermediate, and advanced tiers. Then take on realistic problems modeled on the coding-test patterns of major companies — fundamentals and real-world readiness in one place.',
    f4CompaniesNote:
      'These are not the original past problems. We analyze real exam patterns and provide reconstructed variant problems. We start with the companies below and expand coverage step by step.',
    f4Mou: 'We plan to support access to original past problems through future MOUs with companies.',
    supported: 'Available',
    comingSoon: 'Coming soon',
    allLangs: 'and every language',
    allLangsNote: 'Our goal is to support every programming language — the list keeps growing.',
    companiesLabel: 'Company coding tests (variant problems)',
    osEyebrow: 'debateMate',
    osTitle: 'A problem bank everyone builds',
    osDesc:
      'We fill the problem gap every young online judge faces — together, with the community. Anyone can author algorithm problems, upload them, and, after review, see them go live in the real service.',
    osPoints: [
      { title: 'Anyone can author', desc: 'Regular users can create and upload their own algorithm problems.' },
      { title: 'You keep the copyright', desc: 'You own the problems you create. Donate one to Debate Code and ownership transfers to us.' },
      { title: 'Live after review', desc: 'Submitted problems go through inspection and review before shipping to the live service.' },
    ],
    osWeekly: 'Official Debate Code problems are added 10 at a time, every Monday at 00:00 KST.',
    stats: [
      { value: '$0', label: 'Free forever · no payments' },
      { value: '+10', label: 'New problems every Monday' },
      { value: '9+', label: 'Languages live or coming' },
    ],
    faqTitle: 'Frequently asked questions',
    faqs: [
      {
        q: 'Is it really all free?',
        a: 'Yes. Debate Code is 100% freeware — no subscriptions, no payments, no premium tiers. Every problem, the judge, and the community are free forever.',
      },
      {
        q: 'Can I use it without connecting an AI?',
        a: 'Absolutely. Problem solving and the judging system work exactly the same without AI. When you want the interview feature, pick your way: your own API key, debateNetwork (MCP), or debateBridge (local Ollama).',
      },
      {
        q: 'Which AI models can I use?',
        a: 'Token-limited models are included with no key to register — DeepSeek V4, DeepSeek R1, Qwen 3.6, and Qwen3-Coder. Choose by job: reasoning, fast answers, code, or agent work. If you already have an API key, Pro Tier connects ChatGPT, Gemini, Claude, Grok, and Perplexity, with billing going to that key’s account. The lineup can change with upstream availability, and this list changes with it.',
        proNote: true,
      },
      {
        q: 'Is there a cap on AI usage?',
        a: 'The debateAI tab has no cap. If running costs climb we may add one, and we will announce it before anything changes. AI Search runs in a single session with 50 questions a day, refilling at midnight.',
      },
      {
        q: 'Which programming languages are supported?',
        a: 'Python and JavaScript today, with Java, C, C++, C#, TypeScript, Rust, and Dart on the way. The end goal is every language.',
      },
      {
        q: 'How often are problems added?',
        a: 'Official problems arrive 10 at a time every Monday at 00:00 KST, plus community-authored debateMate problems that go live after review.',
      },
      {
        q: 'Are the company problems real past exams?',
        a: 'No — they are variant problems reconstructed from real exam patterns. We plan to support original past problems through future MOUs with companies.',
      },
    ],
    bannerTitle: 'No more coding alone',
    bannerDesc: 'Join the Debate Code community — share questions, connect with peers, and grow together every day.',
    bannerCta: 'Get Started Together',
    caseHeader: ['CASE', 'STATUS', 'TIME', 'MEM'],
  },
};

/**
 * Pro Tier(BYOK) 일시 중단 안내.
 *
 * 보안 점검이 끝나면 이 상수를 false로 두면 `proNote: true`가 붙은 FAQ 답변에서
 * 안내 문장이 사라진다. 완전히 걷어낼 때는 이 상수와 ko/en `aiProSuspended` 카피,
 * FAQ의 `proNote` 표시, 그리고 아래 `faqs` 조립부 한 줄만 지우면 된다.
 */
const PRO_TIER_SUSPENDED = true;

const LANGS_NOW = ['Python', 'JavaScript'];
const LANGS_SOON = ['Java', 'C', 'C++', 'C#', 'Dart', 'Rust', 'TypeScript'];
const COMPANIES_KO = ['카카오', '삼성전자', '현대자동차', '토스'];
const COMPANIES_EN = ['Kakao', 'Samsung', 'Hyundai Motor', 'Toss'];

// 토픽 타일 아이콘 배경 (브릴리언트식 파스텔 스퀘어)
const TINTS: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  rose: 'bg-rose-50 text-rose-500',
  emerald: 'bg-emerald-50 text-emerald-600',
  sky: 'bg-sky-50 text-sky-600',
};

/**
 * 섹션 표식.
 *
 * 예전에는 섹션마다 같은 크기의 대문자 아이브로우가 붙었다. 여섯 번 반복되면
 * 그 라벨은 더 이상 정보가 아니라 장식이고, "AI가 만든 랜딩"의 대표적인 티가 된다.
 * 지금은 번호를 앞세운 얇은 표식으로 바꿔, 몇 번째 이야기인지만 조용히 알린다.
 */
function Eyebrow({
  children,
  index,
  tone = 'light',
  className = '',
}: {
  children: React.ReactNode;
  /** 01, 02 … 없으면 번호 없이 라벨만 */
  index?: number;
  /** 잉크 밴드 위에 얹힐 때는 명도 계단의 -on-dark 짝을 쓴다 */
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const dark = tone === 'dark';
  return (
    <p
      className={`flex items-center gap-2 text-[12px] font-semibold tracking-wide ${
        dark ? 'text-fg-on-dark-muted' : 'text-fg-muted'
      } ${className}`}
    >
      {index !== undefined && (
        <span aria-hidden className={`dc-num font-mono text-[11px] ${dark ? 'text-brand-300' : 'text-brand-600'}`}>
          {String(index).padStart(2, '0')}
        </span>
      )}
      <span aria-hidden className={`h-px w-6 ${dark ? 'bg-hairline-on-dark' : 'bg-hairline'}`} />
      {children}
    </p>
  );
}

export default function LandingContent() {
  const { language } = useLanguage();
  const c = COPY[language];
  const companies = language === 'ko' ? COMPANIES_KO : COMPANIES_EN;
  // Pro Tier가 닫혀 있는 동안만 해당 답변 끝에 안내 한 줄을 덧붙인다.
  const faqs = c.faqs.map((f) =>
    f.proNote && PRO_TIER_SUSPENDED ? { ...f, a: `${f.a} ${c.aiProSuspended}` } : f,
  );

  return (
    <>
      {/* ============================================================= */}
      {/* 토픽 타일 — 핵심 기능 4종 */}
      {/* ============================================================= */}
      <section className="py-24 sm:py-32 bg-surface">
        <div className="max-w-6xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <Eyebrow className="justify-center">{c.whyEyebrow}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg">
              {c.whyTitle}
            </h2>
            <p className="mt-4 text-fg-secondary leading-relaxed">{c.whyDesc}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {c.features.map((card) => (
              <div
                key={card.title}
                className="group rounded-[var(--radius-panel)] border border-hairline bg-surface p-6 transition-[color,background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(20,21,43,0.18)] hover:border-brand-200"
              >
                <div
                  aria-hidden
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold mb-4 ${TINTS[card.tint]}`}
                >
                  {card.icon}
                </div>
                <h3 className="text-base font-bold text-fg mb-2">{card.title}</h3>
                <p className="text-sm text-fg-secondary leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 01 — DebateAI */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-20 bg-paper">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-4">
            <Eyebrow index={1}>{c.f1Eyebrow}</Eyebrow>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg">
              {c.f1Title}
            </h2>
            <p className="text-fg-secondary leading-relaxed">{c.f1Desc}</p>
          </div>

          <div className="space-y-4">
            <div className="bg-ink rounded-[var(--radius-panel)] p-6 font-mono text-sm shadow-[0_16px_40px_-16px_rgba(20,21,43,0.35)]">
              <div className="text-brand-300 text-xs mb-3">DebateAI</div>
              <p className="text-fg-on-dark-secondary leading-relaxed border-l-2 border-brand-400/50 pl-4">{c.f1Quote}</p>
            </div>

            {/* AI 제공자 선택 */}
            <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-5">
              <p className="text-xs font-semibold text-fg-muted mb-3">{c.f1ProvLabel}</p>
              <div className="grid sm:grid-cols-3 gap-2.5">
                {c.f1Providers.map((p) => (
                  <div key={p.tag} className="rounded-xl border border-hairline bg-paper p-3.5">
                    <span className="inline-block font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 mb-2">
                      {p.tag}
                    </span>
                    <p className="text-sm font-bold text-fg">{p.title}</p>
                    <p className="mt-1 text-xs text-fg-muted leading-relaxed">{p.desc}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs text-fg-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {c.f1AiOptional}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 02 — AI 검색 (DeepSeek · 한 세션 · 하루 50회)            */}
      {/*                                                                */}
      {/* 앞뒤가 모두 밝은 면이라 여기서 한 번 어두워진다. 이 서비스에서 AI가   */}
      {/* 도는 층임을 색으로 말하는 자리다(DESIGN.md §1 — 작업·마케팅 밴드는  */}
      {/* ink). 모델 카탈로그와 한도 정책은 FAQ로 내렸다. 여기에는 숫자 두 개와 */}
      {/* 눌러 볼 수 있는 데모만 남긴다 — 무엇을 할 수 있는지는 나열하는 것보다 */}
      {/* 눌러 보게 하는 쪽이 빠르다.                                       */}
      {/* ============================================================= */}
      <section className="py-20 sm:py-24 bg-ink">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="space-y-4">
            <Eyebrow index={2} tone="dark">
              {c.searchEyebrow}
            </Eyebrow>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg-on-dark">
              {c.searchTitle}
            </h2>
            <p className="text-fg-on-dark-secondary leading-relaxed">{c.searchDesc}</p>

            {/* 한도는 문장이 아니라 숫자로 — "얼마나 쓸 수 있나"가 먼저 보여야 한다 */}
            <dl className="grid grid-cols-2 gap-3 pt-2">
              {c.searchLimits.map((l) => (
                <div
                  key={l.label}
                  className="rounded-[var(--radius-panel)] border border-hairline-on-dark bg-ink-soft p-4"
                >
                  <dt className="text-xs font-semibold text-fg-on-dark-muted">{l.label}</dt>
                  <dd className="dc-num mt-1 font-display text-3xl font-bold text-brand-300">{l.value}</dd>
                  <p className="mt-1.5 text-xs text-fg-on-dark-muted leading-relaxed">{l.note}</p>
                </div>
              ))}
            </dl>
          </div>

          {/* 오른쪽: 눌러 볼 수 있는 검색 데모 — 세 칩이 이 기능이 하는 세 가지 일이다 */}
          <SearchShowcase />
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 03 — 인터랙티브 에디터 (센터 정렬 데모) */}
      {/* ============================================================= */}
      <section className="py-20 sm:py-24 bg-surface">
        <div className="max-w-6xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <Eyebrow index={3} className="justify-center">
              {c.f2Eyebrow}
            </Eyebrow>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg">
              {c.f2Title}
            </h2>
            <p className="mt-4 text-fg-secondary leading-relaxed">{c.f2Desc}</p>
          </div>
          <div className="max-w-5xl mx-auto">
            <EditorShowcase />
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 04 — 채점 시스템 */}
      {/* ============================================================= */}
      <section className="py-20 sm:py-24 bg-paper">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-4">
            <Eyebrow index={4}>{c.f3Eyebrow}</Eyebrow>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg">
              {c.f3Title}
            </h2>
            <p className="text-fg-secondary leading-relaxed">{c.f3Desc}</p>
          </div>
          <div className="bg-surface border border-hairline rounded-[var(--radius-panel)] p-6 font-mono text-xs space-y-1 shadow-[0_12px_32px_-16px_rgba(20,21,43,0.15)]">
            <div className="flex justify-between font-bold border-b border-hairline pb-2 text-fg-quiet text-[11px]">
              {c.caseHeader.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            <div className="flex justify-between py-1.5 text-emerald-600 font-medium">
              <span>#01</span><span>Success</span><span>12 ms</span><span>12.4 MB</span>
            </div>
            <div className="flex justify-between py-1.5 text-emerald-600 font-medium">
              <span>#02</span><span>Success</span><span>18 ms</span><span>12.5 MB</span>
            </div>
            <div className="flex justify-between py-1.5 px-2 -mx-2 rounded bg-rose-500/10 text-rose-600 font-medium">
              <span>#03 ({language === 'ko' ? '효율성' : 'perf'})</span><span>TLE</span><span>&gt;2000 ms</span><span>14.1 MB</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 05 — 문제집: 난이도별 + 기업 변형문제 + 언어 로드맵 */}
      {/* ============================================================= */}
      <section className="py-20 sm:py-24 bg-surface">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="lg:order-2 space-y-4">
            <Eyebrow index={5}>{c.f4Eyebrow}</Eyebrow>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg">
              {c.f4Title}
            </h2>
            <p className="text-fg-secondary leading-relaxed">{c.f4Desc}</p>
          </div>

          <div className="lg:order-1 space-y-5">
            {/* 지원 언어 */}
            <div className="rounded-[var(--radius-panel)] border border-hairline bg-paper p-5">
              <p className="text-xs font-semibold text-fg-muted mb-3">Languages</p>
              <div className="flex flex-wrap gap-2">
                {LANGS_NOW.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1.5 font-mono px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-sm font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {l}
                  </span>
                ))}
                <span className="inline-flex items-center px-2 py-1.5 text-[11px] font-semibold text-fg-quiet">
                  {c.supported}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {LANGS_SOON.map((l) => (
                  <span
                    key={l}
                    className="font-mono px-3 py-1.5 rounded-full bg-surface border border-hairline text-fg-muted text-sm"
                  >
                    {l}
                  </span>
                ))}
                {/* 모든 언어 catch-all */}
                <span className="inline-flex items-center gap-1.5 font-mono px-3 py-1.5 rounded-full border border-dashed border-brand-300 bg-brand-50/60 text-brand-600 text-sm">
                  <span aria-hidden>∞</span>
                  {c.allLangs}
                </span>
              </div>
              <p className="mt-3 text-xs text-fg-muted">{c.allLangsNote}</p>
            </div>

            {/* 기업 변형문제 */}
            <div className="rounded-[var(--radius-panel)] border border-hairline bg-paper p-5">
              <p className="text-xs font-semibold text-fg-muted mb-3">{c.companiesLabel}</p>
              <div className="flex flex-wrap gap-2">
                {companies.map((name) => (
                  <span
                    key={name}
                    className="px-3 py-1.5 rounded-full bg-surface border border-hairline text-fg-secondary text-sm font-medium"
                  >
                    {name}
                  </span>
                ))}
                <span className="inline-flex items-center px-2 py-1.5 text-[11px] font-semibold text-brand-600/80">
                  {c.comingSoon} +
                </span>
              </div>
              <p className="mt-3 text-xs text-fg-muted leading-relaxed">{c.f4CompaniesNote}</p>
              <p className="mt-2 text-xs font-semibold text-brand-600/80">{c.f4Mou}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* debateMate — 커뮤니티 출제 저지 */}
      {/* ============================================================= */}
      <section className="py-20 sm:py-24 bg-paper">
        <div className="max-w-6xl mx-auto px-6 sm:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <Eyebrow index={6} className="justify-center">{c.osEyebrow}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg">
              {c.osTitle}
            </h2>
            <p className="mt-4 text-fg-secondary leading-relaxed">{c.osDesc}</p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {c.osPoints.map((p, i) => (
              <div key={i} className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-6">
                <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 text-sm font-bold flex items-center justify-center mb-4">
                  {i + 1}
                </div>
                <h3 className="text-base font-bold text-fg mb-1.5">{p.title}</h3>
                <p className="text-sm text-fg-secondary leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-panel)] border border-brand-200 bg-brand-50 p-5">
            <span className="mt-0.5 font-mono text-[11px] font-bold text-brand-700 whitespace-nowrap">NEW</span>
            <p className="text-sm text-brand-900/80 leading-relaxed">{c.osWeekly}</p>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* 통계 밴드 — 브릴리언트식 신뢰 지표 */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-20 bg-surface border-y border-hairline">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 grid grid-cols-1 sm:grid-cols-3 gap-10 text-center">
          {c.stats.map((s) => (
            <div key={s.label}>
              <p className="dc-num font-display text-4xl sm:text-5xl font-bold text-brand-600">{s.value}</p>
              <p className="mt-2 text-sm text-fg-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================= */}
      {/* FAQ — 네이티브 아코디언 */}
      {/* ============================================================= */}
      <section className="py-20 sm:py-24 bg-surface">
        <div className="max-w-3xl mx-auto px-6 sm:px-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-fg text-center mb-10">
            {c.faqTitle}
          </h2>
          <div className="divide-y divide-hairline border-y border-hairline">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none text-base font-semibold text-fg hover:text-brand-600 transition-colors [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg
                    viewBox="0 0 20 20"
                    className="w-5 h-5 shrink-0 text-fg-quiet transition-transform group-open:rotate-45"
                    fill="none"
                    aria-hidden
                  >
                    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </summary>
                <p className="pb-5 pr-9 text-[15px] text-fg-secondary leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
