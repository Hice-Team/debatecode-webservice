'use client';

// 랜딩 본문 — 브릴리언트(brilliant.org)식 라이트 레이아웃.
// 센터 정렬 섹션 헤더 + 라운드 카드 + white/paper 교차 밴드 + 통계 + FAQ + CTA.
// useLanguage 기반 ko/en 국제화. 브랜드 = 워드마크 인디고(#1800AC).
// 디베이트코드는 100% 프리웨어 — 구독/결제 유도 카피는 두지 않는다.

import { useLanguage } from '@/app/context/language-context';
import type { Language } from '@/app/lib/i18n';
import EditorShowcase from './editor-showcase';

type Lang = Language;

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
        a: '네. Debate Code는 100% 프리웨어입니다. 구독도, 결제도, 프리미엄 플랜도 없습니다. 모든 문제·채점·커뮤니티 기능을 평생 무료로 사용할 수 있습니다. 향후 사용자 증가로 인한 서버 비용 부담이 커질 경우, 서비스 유지를 위해 일부 기능에 대해 부분유료화가 진행될 수도 있습니다.',
      },
      {
        q: 'AI를 연결하지 않아도 쓸 수 있나요?',
        a: '물론입니다. AI 없이도 문제 풀이와 채점 시스템은 그대로 동작합니다. AI 면접 기능을 쓰고 싶다면 내 API 키 연결, debateNetwork(MCP), debateBridge(로컬 LLM) 중 원하는 방식을 선택하면 됩니다.',
      },
      {
        q: '어떤 AI 모델을 쓸 수 있나요?',
        a: '키를 등록하지 않아도 하루 일정량만 제공하는 기본 모델은 바로 사용할 수 있습니다 — DeepSeek V4, DeepSeek R1, Qwen 3.6, Qwen3-Coder. 만일 보유한 API 키가 있다면 ChatGPT, Gemini, Claude, Grok, Perplexity, Meta 등의 다양한 모델을 붙일 수 있습니다. 이때 요금은 그 키의 계정으로 청구됩니다. 제공 모델은 업스트림 사정에 따라 바뀔 수 있고, 바뀌면 이 목록도 함께 고칩니다.',
      },
      {
        q: 'AI 사용 횟수에 제한이 있나요?',
        a: 'debateAI 탭은 문제당 하루 10회의 무료 대화를 제공합니다. 내 API 키나 debateBridge(로컬 모델)를 연결하면 횟수 제한 없이 자유롭게 쓸 수 있습니다.',
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
        a: 'The debateAI tab includes 10 free questions per problem each day. When you connect your own API key or debateBridge (local model), there is no limit.',
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
  ja: {
    whyEyebrow: 'なぜ Debate Code なのか',
    whyTitle: '解いて、反論し、成長する学習',
    whyDesc: '問題を解いて終わりではありません。コードの論理を証明する過程こそが真の学習です。',
    features: [
      { icon: 'λ', tint: 'brand', title: 'アルゴリズム問題', desc: '基礎文法から高度なアルゴリズムまで、厳選された問題を提供します。' },
      { icon: '◍', tint: 'rose', title: '対話型技術面接', desc: '自分が書いたコードをもとにAIと反論を交わし、技術面接に備えます。' },
      { icon: '✎', tint: 'emerald', title: '成長コミュニティ', desc: '集団知性を通じてコードレビューを受け、気軽に質問・回答できます。' },
      { icon: '⚑', tint: 'sky', title: '最新コーディングテスト対策', desc: '企業別の出題傾向と実戦模試で、AI採用トレンドに合わせた実戦力を磨きます。' },
    ],
    f1Eyebrow: 'DebateAI',
    f1Title: '対話型AI技術面接官',
    f1Desc:
      '問題を正解しても、そこで終わりではありません。提出されたコードをDebateAIが多角的に分析し、計算量の最適化・例外処理・メモリ効率について鋭い技術的指摘を行います。これに対してコードの論理を自ら防御し、真の面接力を身につけます。',
    f1Quote:
      '「作成されたO(N²)のソートは大規模データで遅延を招く可能性があります。メモリを追加で使ってもO(N log N)に短縮するアイデアはありますか？」',
    f1ProvLabel: 'AIプロバイダーは自分で選択可能',
    f1Providers: [
      { tag: 'BYO Key', title: '自分のAPIキーを接続', desc: 'OpenAI・Anthropic・GoogleなどのAPIキーを直接登録して使用します。' },
      { tag: 'MCP', title: 'debateNetwork', desc: 'MCPサーバーを実行し、AIサービスとDebate Codeを安全に連携します。' },
      { tag: 'Local', title: 'debateBridge', desc: 'デスクトップアプリでローカルのOllamaモデルと接続し、完全オフラインで利用できます。' },
    ],
    f1AiOptional: '接続しなくても、基本提供モデルですぐに開始できます。',
    aiProSuspended: '現在セキュリティ点検のためPro Tier接続を一時停止しています。再開時に告知します。',
    f2Eyebrow: 'ワークスペース',
    f2Title: '没入型オンラインコードエディタ',
    f2Desc: (
      <>
        左側パネルの<strong className="text-fg">ナビゲーションバー</strong>で問題文・分析・試行履歴・DebateAI対話を自在に切り替え、
        右側パネルの<strong className="text-fg">VS Codeスタイルワークスペース</strong>で問題分析からコーディング、採点、AIディベートまで1つの画面で完結します。
      </>
    ),
    f3Eyebrow: '判定エンジン',
    f3Title: '超高速・高精度な採点システム',
    f3Desc:
      '安全に隔離された仮想サンドボックス環境で提出コードをリアルタイム実行。正確なテストケース検証に加え、ミリ秒単位の実行時間とKB単位のメモリ使用量を計測し、微細な例外まで正確に検出します。',
    f4Eyebrow: '問題集',
    f4Title: 'レベル別アルゴリズムから企業コーディングテストまで',
    f4Desc:
      '入門・初級・中級・上級とステップ順に攻略。主要企業のコーディングテスト傾向を反映した実戦問題まで、基本と実戦力を一度に完成させます。',
    f4CompaniesNote:
      '実際の出題傾向を分析・再構成した変形問題を提供します。まずは以下の企業からスタートし、対象を順次拡大します。',
    f4Mou: '今後は企業との連携(MOU)を通じて過去問原本の閲覧・演習サポートも計画しています。',
    supported: '対応中',
    comingSoon: '対応予定',
    allLangs: 'そしてすべての言語へ',
    allLangsNote: 'すべてのプログラミング言語をサポートすることが目標です — 随時追加されています。',
    companiesLabel: '企業コーディングテスト（変形問題）',
    osEyebrow: 'debateMate',
    osTitle: 'みんなで作る問題集',
    osDesc:
      'コミュニティの力で問題集を充実させます。誰でもアルゴリズム問題を作成して提出し、審査を経て本サービスに反映されます。',
    osPoints: [
      { title: '誰でも出題者に', desc: '一般ユーザーもアルゴリズム問題を制作・アップロードできます。' },
      { title: '著作権は作者に', desc: '制作した問題の著作権は作者に帰属します。寄贈することも可能です。' },
      { title: '審査を経て反映', desc: '提出された問題は審査・検収を経て実際のサービスに追加されます。' },
    ],
    osWeekly: '公式問題は毎週月曜日0時に10問ずつ追加されます。',
    stats: [
      { value: '¥0', label: '完全無料 · 課金なし' },
      { value: '+10', label: '毎週月曜日に新問題追加' },
      { value: '9+', label: '対応および対応予定言語' },
    ],
    faqTitle: 'よくある質問',
    faqs: [
      {
        q: '本当にすべて無料ですか？',
        a: 'はい。Debate Codeは100%フリーウェアです。サブスクリプションも課金もありません。すべての問題・採点・コミュニティ機能が永久無料で利用できます。',
      },
      {
        q: 'AIを接続しなくても使えますか？',
        a: 'もちろんです。AIなしでも問題解答と採点システムはそのまま動作します。AI面接を使いたい場合は、APIキーやローカルモデルを選択できます。',
      },
      {
        q: 'どのAIモデルが使えますか？',
        a: 'キー未登録でも基本提供モデル(DeepSeek, Qwen等)をご利用いただけます。APIキーをお持ちの場合はChatGPT, Claude, Geminiなども連携可能です。',
      },
      {
        q: 'AIの利用回数に制限はありますか？',
        a: 'debateAIタブでは問題ごとに1日10回の無料会話を提供しています。ご自身のAPIキーやローカルモデルを接続すれば無制限で利用できます。',
      },
      {
        q: 'どのプログラミング言語に対応していますか？',
        a: '現在はPythonとJavaScriptに対応しており、Java, C++, TypeScript, Rustなどを順次追加しています。',
      },
      {
        q: '問題はどのくらいの頻度で追加されますか？',
        a: '公式問題は毎週月曜日0時に10問ずつ追加されます。さらにコミュニティからのdebateMate問題も随時審査・反映されます。',
      },
      {
        q: '企業テスト問題は実際の過去問ですか？',
        a: '実際の出題傾向を分析して再構成した変形問題です。',
      },
    ],
    bannerTitle: 'ひとりで悩むコーディングはもう終わり',
    bannerDesc: 'Debate Code コミュニティで仲間と交流し、質問を共有しながら、毎日の成長を実感しましょう。',
    bannerCta: '一緒に始める',
    caseHeader: ['CASE', 'STATUS', 'TIME', 'MEM'],
  },
  'zh-CN': {
    whyEyebrow: '为什么选择 Debate Code',
    whyTitle: '刷题、辩论、持续精进',
    whyDesc: '做对题目绝不是终点。用语言论证和捍卫你的代码逻辑，才是深度的真学实练。',
    features: [
      { icon: 'λ', tint: 'brand', title: '精选算法题库', desc: '从基础语法到高阶算法，提供层层递进的优质核心题集。' },
      { icon: '◍', tint: 'rose', title: '对话式技术面试', desc: '基于你亲手编写的代码与AI互相反驳推演，全真模拟大厂技术面。' },
      { icon: '✎', tint: 'emerald', title: '极客共创社区', desc: '汇聚群体智慧进行代码Review，自由探讨技术难点与解答疑惑。' },
      { icon: '⚑', tint: 'sky', title: '前沿机试备考', desc: '名企真题变形题与全真模考，紧跟AI时代企业招聘考核新趋势。' },
    ],
    f1Eyebrow: 'DebateAI',
    f1Title: '对话式 AI 技术面试官',
    f1Desc:
      '通过测试用例仅仅是第一步。提交代码后，DebateAI将深度分析你的代码架构，就时间复杂度优化、极端边界情况及内存效率提出犀利的技术质疑。你必须亲自用逻辑答辩反驳，从而磨练货真价实的大厂技术面试语感。',
    f1Quote:
      '“你所写的双重循环排序在极端大数据量下可能超时。即使消耗额外空间，你有思路将其降低至 O(N log N) 吗？”',
    f1ProvLabel: '自由选择 AI 服务商',
    f1Providers: [
      { tag: 'BYO Key', title: '接入个人 API Key', desc: '可直接登记个人的 OpenAI、Anthropic、Google 等 API 密钥进行调用。' },
      { tag: 'MCP', title: 'debateNetwork', desc: '在本地运行 MCP 服务器，安全联通外部 AI 服务与 Debate Code。' },
      { tag: 'Local', title: 'debateBridge', desc: '通过桌面客户端无缝对接本地 Ollama 模型，享受纯离线安全体验。' },
    ],
    f1AiOptional: '即使不配置任何密钥，也可直接使用内置免费模型开启答辩。',
    aiProSuspended: '目前因安全审计暂时停用 Pro Tier 接入，重新开放时将另行通知。',
    f2Eyebrow: '工作区',
    f2Title: '沉浸式在线代码编辑器',
    f2Desc: (
      <>
        利用左侧面板的<strong className="text-fg">导航栏</strong>在题面描述、题目分析、提交历史与 DebateAI 对话窗口间自由切换，
        并在右侧宽广的<strong className="text-fg">VS Code 风格工作区</strong>中一屏搞定分析、写码、评测与 AI 辩论。
      </>
    ),
    f3Eyebrow: '判题引擎',
    f3Title: '超高速·高精度沙箱判题系统',
    f3Desc:
      '在安全隔离的虚拟沙箱环境中实时运行提交代码。不仅进行严苛的测试用例比对，更毫秒级度量执行耗时与内存占用，精准捕获 TLE/MLE 等微小边界异常。',
    f4Eyebrow: '题库体系',
    f4Title: '从梯度算法练习到名企机试真题',
    f4Desc:
      '涵盖入门、初级、中级到高级的完整进阶链路。更还原了知名科技企业的出题偏好与实战风格，基本功与应试手感一站式打通。',
    f4CompaniesNote:
      '我们分析真实机试规律并精心重构了变形试题。优先支持以下代表企业，后续将逐步扩大题库范畴。',
    f4Mou: '未来计划通过校企合作(MOU)引入原版历年真题的查阅与演练支持。',
    supported: '已支持',
    comingSoon: '即将支持',
    allLangs: '乃至所有编程语言',
    allLangsNote: '我们的终极目标是覆盖全量编程语言 — 更多语言持续接入中。',
    companiesLabel: '名企机试（变形题库）',
    osEyebrow: 'debateMate',
    osTitle: '众人共建的开源题库',
    osDesc:
      '借助极客社区的力量化解新兴题库储备不足的痛点。任何人都能自主设计并上传算法题目，经严格审核后并入主站题库。',
    osPoints: [
      { title: '人人皆可出题', desc: '普通开发者亦可构思算法题并上传至审核中心。' },
      { title: '创作者享有版权', desc: '创作者完整享有题目的知识产权，亦可选择授权捐赠至社区。' },
      { title: '严审后上线', desc: '提交题目历经人工与机器验证，确保题干与测试用例无误后正式发布。' },
    ],
    osWeekly: '官方精选题库每周一 00:00 准时上新 10 道。',
    stats: [
      { value: '¥0', label: '永久免费 · 绝无付费墙' },
      { value: '+10', label: '每周一上新精选题' },
      { value: '9+', label: '已支持及筹备中语言' },
    ],
    faqTitle: '常见问题解答',
    faqs: [
      {
        q: '平台真的完全免费吗？',
        a: '是的。Debate Code 为 100% 免费软件。无订阅制、无付费墙、无商业等级门槛。题库解题、沙箱判题与社区讨论永久免费开放。',
      },
      {
        q: '不连接 AI 也能正常使用吗？',
        a: '当然可以。常规刷题、沙箱判题与用例检测在无 AI 下完全正常运行。若需要技术面试功能，可随时挑选适合的 AI 接入通道。',
      },
      {
        q: '支持哪些 AI 模型？',
        a: '免密钥模式下提供免费体验模型（DeepSeek V4, Qwen 等）。配置私有 API Key 时支持 ChatGPT, Claude, Gemini, Grok 等主流顶级大模型。',
      },
      {
        q: 'AI 答辩使用次数有限制吗？',
        a: '免费体验模式每题每日提供 10 次对话额度；接入私有 Key 或本地 Ollama 客户端后无任何频次限制。',
      },
      {
        q: '目前支持哪些编程语言？',
        a: '现已支持 Python 和 JavaScript，Java、C++、TypeScript、Rust 等语言正按排期陆续实装。',
      },
      {
        q: '题库更新频次如何？',
        a: '官方题目每周一 00:00 固定更新 10 道，此外 debateMate 社区出题作品在审核通过后随时动态加入。',
      },
      {
        q: '企业真题是历年原题吗？',
        a: '根据各大厂真实考察脉络重构的精编变形题，旨在考核核心思路而非死记硬背。',
      },
    ],
    bannerTitle: '别再一个人孤独刷题',
    bannerDesc: '加入 Debate Code 极客社区，与同路人交流心得、分享解法，每天共同体会认知跃迁的乐趣。',
    bannerCta: '立即加入探索',
    caseHeader: ['CASE', 'STATUS', 'TIME', 'MEM'],
  },
  'zh-TW': {
    whyEyebrow: '為什麼選擇 Debate Code',
    whyTitle: '解題、辯論、持續成長',
    whyDesc: '答對題目絕不是終點。用語言論證並捍衛你的程式邏輯，才是深度的真學實練。',
    features: [
      { icon: 'λ', tint: 'brand', title: '精選演算法題庫', desc: '從基礎語法到高階演算法，提供循序漸進的核心優質題集。' },
      { icon: '◍', tint: 'rose', title: '對話式技術面試', desc: '基於親手編寫的程式碼與AI互相辯駁推演，全真模擬頂尖科技公司技術面。' },
      { icon: '✎', tint: 'emerald', title: '工程師共創社群', desc: '凝聚群體智慧進行Code Review，輕鬆探討技術難題與互相交流。' },
      { icon: '⚑', tint: 'sky', title: '實戰上機測驗備戰', desc: '名企常考題型與實戰模擬考，緊跟AI時代企業招募新標準。' },
    ],
    f1Eyebrow: 'DebateAI',
    f1Title: '對話式 AI 技術面試官',
    f1Desc:
      '通過測試資料只是起點。送出程式碼後，DebateAI將深度剖析你的邏輯架構，針對時間複雜度優化、邊界極端條件與記憶體效能提出犀利質疑。你必須親自進行技術答辯，磨練大廠面試實戰身手。',
    f1Quote:
      '「此處的雙重迴圈在巨量輸入下可能逾時。即使增加額外記憶體，你有思路降低至 O(N log N) 嗎？」',
    f1ProvLabel: '自由挑選 AI 服務商',
    f1Providers: [
      { tag: 'BYO Key', title: '連結個人 API Key', desc: '可登記個人的 OpenAI、Anthropic、Google 等 API 金鑰直接調用。' },
      { tag: 'MCP', title: 'debateNetwork', desc: '在本地端運行 MCP 伺服器，安全對接外部 AI 與 Debate Code。' },
      { tag: 'Local', title: 'debateBridge', desc: '透過桌面客戶端連結本地 Ollama 模型，享受純離線安全體驗。' },
    ],
    f1AiOptional: '即使不配置任何金鑰，也可直接使用內建免費模型開啟答辯。',
    aiProSuspended: '目前因安全性稽核暫時關閉 Pro Tier 串接，重新開放時將另行公告。',
    f2Eyebrow: '工作區',
    f2Title: '沉浸式線上程式碼編輯器',
    f2Desc: (
      <>
        利用左側面板的<strong className="text-fg">導覽列</strong>在題目描述、題目分析、提交紀錄與 DebateAI 對話視窗間自由切換，
        並在右側寬敞的<strong className="text-fg">VS Code 風格工作區</strong>中一站搞定分析、編寫、評判與 AI 辯論。
      </>
    ),
    f3Eyebrow: '評判引擎',
    f3Title: '超高速·高精度沙盒評測系統',
    f3Desc:
      '在安全隔離的虛擬沙盒環境中即時執行送出程式。除嚴格比對測試資枓外，更毫秒級度量耗時與記憶體耗用，精確偵測各類微小邊界異常。',
    f4Eyebrow: '題庫體系',
    f4Title: '從梯度演算法練習到企業機試考題',
    f4Desc:
      '涵蓋入門、初階、中階到高階的完整進階路徑。更還原了指標科技企業的出題風格，基礎功底與應試手感一次到位。',
    f4CompaniesNote:
      '我們分析真實上機測驗趨勢並精細重構出變形考題。優先支援以下企業，後續將陸續擴增題庫範圍。',
    f4Mou: '未來計畫透過產學合作(MOU)引進原版歷年考題的查閱與練習支援。',
    supported: '已支援',
    comingSoon: '即將支援',
    allLangs: '乃至所有程式語言',
    allLangsNote: '我們的終極目標是支援所有程式語言 — 更多語言正陸續加入。',
    companiesLabel: '指標企業考題（變形題庫）',
    osEyebrow: 'debateMate',
    osTitle: '眾人共創的開源題庫',
    osDesc:
      '藉由社群的力量豐富題庫深度。任何人都能自主設計並上傳演算法題目，經嚴謹審核後正式收錄於平台。',
    osPoints: [
      { title: '人人皆可出題', desc: '一般開發者亦可構想演算法題目並上傳審核。' },
      { title: '創作者保有著作權', desc: '創作者完整保有題目的著作權益，亦可選擇捐贈回饋社群。' },
      { title: '嚴審後上線', desc: '送審題目歷經檢驗，確認題目敘述與測試測資無誤後正式發布。' },
    ],
    osWeekly: '官方精選題目每週一 00:00 固定上架 10 題。',
    stats: [
      { value: 'NT$0', label: '永久免費 · 絕無收費牆' },
      { value: '+10', label: '每週一上新精選題目' },
      { value: '9+', label: '已支援及籌備中語言' },
    ],
    faqTitle: '常見問題解答',
    faqs: [
      {
        q: '平台真的完全免費嗎？',
        a: '是的。Debate Code 為 100% 免費軟體。無訂閱制、無付費牆、無功能門檻。題庫解題、沙盒評測與社群交流永久免費開放。',
      },
      {
        q: '不連接 AI 也能正常使用嗎？',
        a: '當然可以。常規練習、沙盒評判與測資檢測在無 AI 下完全正常運行。需要技術面試功能時，可隨時自選適合的 AI 通道。',
      },
      {
        q: '支援哪些 AI 模型？',
        a: '免金鑰模式下提供免費體驗模型（DeepSeek, Qwen 等）。設定私有 API Key 時支援 ChatGPT, Claude, Gemini, Grok 等主流旗艦模型。',
      },
      {
        q: 'AI 答辯使用次數有限制嗎？',
        a: '免費體驗模式每題每日提供 10 次對話額度；串接個人 Key 或本地端 Ollama 後無任何頻率限制。',
      },
      {
        q: '目前支援哪些程式語言？',
        a: '現已支援 Python 與 JavaScript，Java、C++、TypeScript、Rust 等語言正按規劃陸續實裝。',
      },
      {
        q: '題庫更新頻率如何？',
        a: '官方精選題目每週一 00:00 定期更新 10 題，此外 debateMate 社群出題作品在審核通過後隨時動態加入。',
      },
      {
        q: '企業考古題是真實原題嗎？',
        a: '根據真實考試脈絡重構的精編變形考題，旨在檢驗核心思考能力而非死記硬背。',
      },
    ],
    bannerTitle: '別再獨自孤單刷題',
    bannerDesc: '加入 Debate Code 社群，與志同道合的夥伴交流心得、分享最佳解法，每天感受思維躍升的喜悅。',
    bannerCta: '立即加入體驗',
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
const COMPANIES_JA = ['LINEヤフー', 'メルカリ', '楽天', 'ソニー'];
const COMPANIES_ZH_CN = ['阿里巴巴', '腾讯', '字节跳动', '美团'];
const COMPANIES_ZH_TW = ['台積電', '聯發科', '蝦皮購物', 'LINE台灣'];

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
      className={`flex items-center gap-2 text-[12px] font-semibold tracking-wide ${dark ? 'text-fg-on-dark-muted' : 'text-fg-muted'
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
  const c = COPY[language] ?? COPY.ko;
  const companies =
    language === 'ja'
      ? COMPANIES_JA
      : language === 'zh-CN'
        ? COMPANIES_ZH_CN
        : language === 'zh-TW'
          ? COMPANIES_ZH_TW
          : language === 'ko'
            ? COMPANIES_KO
            : COMPANIES_EN;

  const perfLabel =
    language === 'ko'
      ? '효율성'
      : language === 'ja'
        ? '効率性'
        : language === 'zh-CN' || language === 'zh-TW'
          ? '效率'
          : 'perf';

  // Pro Tier가 닫혀 있는 동안만 해당 답변 끝에 안내 한 줄을 덧붙인다.
  const faqs = c.faqs.map((f) =>
    f.proNote && PRO_TIER_SUSPENDED ? { ...f, a: `${f.a} ${c.aiProSuspended}` } : f,
  );

  return (
    <>
      {/* ============================================================= */}
      {/* 토픽 타일 — 핵심 기능 4종 */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-24 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-14">
            <Eyebrow className="justify-center">{c.whyEyebrow}</Eyebrow>
            <h2 className="mt-3 font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-fg [word-break:keep-all]">
              {c.whyTitle}
            </h2>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-fg-secondary leading-relaxed [word-break:keep-all]">{c.whyDesc}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {c.features.map((card) => (
              <div
                key={card.title}
                className="group rounded-[var(--radius-panel)] border border-hairline bg-surface p-5 sm:p-6 transition-[color,background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-12px_rgba(20,21,43,0.18)] hover:border-brand-200"
              >
                <div
                  aria-hidden
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold mb-4 ${TINTS[card.tint]}`}
                >
                  {card.icon}
                </div>
                <h3 className="text-base font-bold text-fg mb-2 [word-break:keep-all]">{card.title}</h3>
                <p className="text-sm text-fg-secondary leading-relaxed [word-break:keep-all]">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 01 — DebateAI */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-20 bg-paper">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="space-y-4">
            <Eyebrow index={1}>{c.f1Eyebrow}</Eyebrow>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-fg [word-break:keep-all]">
              {c.f1Title}
            </h2>
            <p className="text-sm sm:text-base text-fg-secondary leading-relaxed [word-break:keep-all]">{c.f1Desc}</p>
          </div>

          <div className="space-y-4">
            <div className="bg-ink rounded-[var(--radius-panel)] p-5 sm:p-6 font-mono text-sm shadow-[0_16px_40px_-16px_rgba(20,21,43,0.35)]">
              <div className="text-brand-300 text-xs mb-3">DebateAI</div>
              <p className="text-fg-on-dark-secondary leading-relaxed border-l-2 border-brand-400/50 pl-4 [word-break:keep-all]">{c.f1Quote}</p>
            </div>

            {/* AI 제공자 선택 */}
            <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-4 sm:p-5">
              <p className="text-xs font-semibold text-fg-muted mb-3">{c.f1ProvLabel}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {c.f1Providers.map((p) => (
                  <div key={p.tag} className="rounded-xl border border-hairline bg-paper p-3.5">
                    <span className="inline-block font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 mb-2">
                      {p.tag}
                    </span>
                    <p className="text-sm font-bold text-fg [word-break:keep-all]">{p.title}</p>
                    <p className="mt-1 text-xs text-fg-muted leading-relaxed [word-break:keep-all]">{p.desc}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs text-fg-secondary [word-break:keep-all]">
                <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-emerald-500" />
                {c.f1AiOptional}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 02 — 인터랙티브 에디터 (센터 정렬 데모) */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-24 bg-paper">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-12">
            <Eyebrow index={2} className="justify-center">
              {c.f2Eyebrow}
            </Eyebrow>
            <h2 className="mt-3 font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-fg [word-break:keep-all]">
              {c.f2Title}
            </h2>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-fg-secondary leading-relaxed [word-break:keep-all]">{c.f2Desc}</p>
          </div>
          <div className="max-w-5xl mx-auto overflow-hidden">
            <EditorShowcase />
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 03 — 채점 시스템 */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-24 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="space-y-4">
            <Eyebrow index={3}>{c.f3Eyebrow}</Eyebrow>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-fg [word-break:keep-all]">
              {c.f3Title}
            </h2>
            <p className="text-sm sm:text-base text-fg-secondary leading-relaxed [word-break:keep-all]">{c.f3Desc}</p>
          </div>
          <div className="bg-paper border border-hairline rounded-[var(--radius-panel)] p-5 sm:p-6 font-mono text-xs space-y-1 shadow-[0_12px_32px_-16px_rgba(20,21,43,0.15)] overflow-x-auto">
            <div className="flex justify-between font-bold border-b border-hairline pb-2 text-fg-quiet text-[11px] min-w-[280px]">
              {c.caseHeader.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            <div className="flex justify-between py-1.5 text-emerald-600 font-medium min-w-[280px]">
              <span>#01</span><span>Success</span><span>12 ms</span><span>12.4 MB</span>
            </div>
            <div className="flex justify-between py-1.5 text-emerald-600 font-medium min-w-[280px]">
              <span>#02</span><span>Success</span><span>18 ms</span><span>12.5 MB</span>
            </div>
            <div className="flex justify-between py-1.5 px-2 -mx-2 rounded bg-rose-500/10 text-rose-600 font-medium min-w-[280px]">
              <span>#03 ({perfLabel})</span><span>TLE</span><span>&gt;2000 ms</span><span>14.1 MB</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Feature 04 — 문제집: 난이도별 + 기업 변형문제 + 언어 로드맵 */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-24 bg-paper">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="lg:order-2 space-y-4">
            <Eyebrow index={4}>{c.f4Eyebrow}</Eyebrow>
            <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-fg [word-break:keep-all]">
              {c.f4Title}
            </h2>
            <p className="text-sm sm:text-base text-fg-secondary leading-relaxed [word-break:keep-all]">{c.f4Desc}</p>
          </div>

          <div className="lg:order-1 space-y-5">
            {/* 지원 언어 */}
            <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-4 sm:p-5">
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
                    className="font-mono px-3 py-1.5 rounded-full bg-paper border border-hairline text-fg-muted text-sm"
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
              <p className="mt-3 text-xs text-fg-muted [word-break:keep-all]">{c.allLangsNote}</p>
            </div>

            {/* 기업 변형문제 */}
            <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-4 sm:p-5">
              <p className="text-xs font-semibold text-fg-muted mb-3">{c.companiesLabel}</p>
              <div className="flex flex-wrap gap-2">
                {companies.map((name) => (
                  <span
                    key={name}
                    className="px-3 py-1.5 rounded-full bg-paper border border-hairline text-fg-secondary text-sm font-medium"
                  >
                    {name}
                  </span>
                ))}
                <span className="inline-flex items-center px-2 py-1.5 text-[11px] font-semibold text-brand-600/80">
                  {c.comingSoon} +
                </span>
              </div>
              <p className="mt-3 text-xs text-fg-muted leading-relaxed [word-break:keep-all]">{c.f4CompaniesNote}</p>
              <p className="mt-2 text-xs font-semibold text-brand-600/80 [word-break:keep-all]">{c.f4Mou}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* debateMate — 커뮤니티 출제 저지 */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-24 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <Eyebrow index={5} className="justify-center">{c.osEyebrow}</Eyebrow>
            <h2 className="mt-3 font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-fg [word-break:keep-all]">
              {c.osTitle}
            </h2>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-fg-secondary leading-relaxed [word-break:keep-all]">{c.osDesc}</p>
          </div>

          <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {c.osPoints.map((p, i) => (
              <div key={i} className="rounded-[var(--radius-panel)] border border-hairline bg-paper p-5 sm:p-6">
                <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 text-sm font-bold flex items-center justify-center mb-4">
                  {i + 1}
                </div>
                <h3 className="text-base font-bold text-fg mb-1.5 [word-break:keep-all]">{p.title}</h3>
                <p className="text-sm text-fg-secondary leading-relaxed [word-break:keep-all]">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-panel)] border border-brand-200 bg-brand-50 p-4 sm:p-5">
            <span className="mt-0.5 font-mono text-[11px] font-bold text-brand-700 whitespace-nowrap">NEW</span>
            <p className="text-sm text-brand-900/80 leading-relaxed [word-break:keep-all]">{c.osWeekly}</p>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* 통계 밴드 — 브릴리언트식 신뢰 지표 */}
      {/* ============================================================= */}
      <section className="py-12 sm:py-16 bg-surface border-y border-hairline">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10 text-center">
          {c.stats.map((s) => (
            <div key={s.label}>
              <p className="dc-num font-display text-3xl sm:text-5xl font-bold text-brand-600">{s.value}</p>
              <p className="mt-2 text-xs sm:text-sm text-fg-muted [word-break:keep-all]">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================= */}
      {/* FAQ — 네이티브 아코디언 */}
      {/* ============================================================= */}
      <section className="py-16 sm:py-24 bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-fg text-center mb-8 sm:mb-10 [word-break:keep-all]">
            {c.faqTitle}
          </h2>
          <div className="divide-y divide-hairline border-y border-hairline">
            {faqs.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none text-sm sm:text-base font-semibold text-fg hover:text-brand-600 transition-colors [&::-webkit-details-marker]:hidden [word-break:keep-all]">
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
                <p className="pb-5 pr-4 sm:pr-9 text-sm sm:text-[15px] text-fg-secondary leading-relaxed [word-break:keep-all]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
