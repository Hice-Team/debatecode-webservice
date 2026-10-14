'use client';

import { useLanguage } from '@/app/context/language-context';
import type { Language } from '@/app/lib/i18n';
import LanguageSwitcher from '@/app/components/language-switcher';

interface LegalSummaryItem {
  title: string;
  desc: string;
}

const SUMMARIES: Record<Language, {
  badge: string;
  notice: string;
  title: string;
  items: LegalSummaryItem[];
  fullTextNote: string;
}> = {
  ko: {
    badge: '공식 준거법: 대한민국 법률',
    notice: 'Debate Code는 비영리로 운영되는 대화형 온라인 저지 및 AI 기술면접 플랫폼입니다.',
    title: '약관 주요 핵심 안내',
    items: [
      { title: '100% 무료 서비스', desc: '구독료나 유료 결제 없이 모든 알고리즘 문제, 채점 및 커뮤니티 기능을 평생 무료로 이용할 수 있습니다.' },
      { title: 'AI 면접 및 면책', desc: 'DebateAI의 피드백은 기술 면접 대비를 돕기 위한 연습용 시뮬레이션이며, 절대적 평가 기준을 대신하지 않습니다.' },
      { title: '지식재산권 보호', desc: '회원이 작성한 코드와 게시글의 저작권은 회원 본인에게 귀속되며, 오픈소스 기여는 커뮤니티 발전을 위해 존중됩니다.' },
      { title: '안전한 개인정보', desc: '회원 가입 및 서비스 제공에 필요한 최소한의 정보만 암호화하여 보관하며, 제3자 마케팅에 무단 제공하지 않습니다.' },
    ],
    fullTextNote: '아래는 법적 효력을 갖는 공식 이용약관 전문입니다.',
  },
  en: {
    badge: 'Governing Law: Republic of Korea',
    notice: 'Debate Code is a non-profit interactive online judge and AI technical interview practice service.',
    title: 'Key Terms & Summary for International Users',
    items: [
      { title: '100% Freeware', desc: 'Every problem, judging sandbox, and community board is free to use without hidden fees or required subscriptions.' },
      { title: 'DebateAI Disclaimers', desc: 'Feedback from DebateAI is an educational simulation for technical interview preparation, not a legal or hiring warranty.' },
      { title: 'Your Intellectual Property', desc: 'You retain full ownership of the code and solutions you author on the platform.' },
      { title: 'Data Privacy & Security', desc: 'We only store the minimal essential account data encrypted, and never sell personal information to third parties.' },
    ],
    fullTextNote: 'Below is the full legal text in Korean (official binding version).',
  },
  ja: {
    badge: '準拠法：大韓民国法令',
    notice: 'Debate Code は非営利で運営されている対話型オンラインジャッジ・AI技術面接プラットフォームです。',
    title: 'グローバル利用者向け 重要条項サマリー',
    items: [
      { title: '完全無料フリーウェア', desc: '定期購読や追加課金なしで、全問題・採点エンジン・コミュニティを永久無料でご利用いただけます。' },
      { title: 'AIディベートに関する免責', desc: 'DebateAIによる面接指摘は学習用のシミュレーションであり、採用結果を保証するものではありません。' },
      { title: '知的財産権の帰属', desc: 'ユーザーが作成したコードおよび投稿の著作権は、作成者本人に帰属します。' },
      { title: '個人情報保護とプライバシー', desc: 'アカウントに必要な最小限の情報のみを暗号化して管理し、第三者への無断提供は一切行いません。' },
    ],
    fullTextNote: '下記は法的効力を有する公式韓国語利用規約の全文です。',
  },
  'zh-CN': {
    badge: '准据法：大韩民国法律',
    notice: 'Debate Code 为非营利性质的对话式在线判题与 AI 技术面试实训平台。',
    title: '国际用户核心条款摘要说明',
    items: [
      { title: '100% 免费软件', desc: '无任何隐藏付费墙或强制订阅，全量算法题库、沙箱判题及极客社区均永久免费开放。' },
      { title: 'AI 答辩免责声明', desc: 'DebateAI 提出的技术质询仅作为模拟面试辅助学习工具，不构成招聘或商业评级的法定依据。' },
      { title: '知识产权归属', desc: '您在平台上编写的独立解法代码和讨论帖文版权均完整归您个人所有。' },
      { title: '个人信息安全与隐私', desc: '仅加密留存维持服务运行所必需的最小量级账户数据，绝不对外擅自提供或出售。' },
    ],
    fullTextNote: '以下内容为具备法律效力的官方韩文协议全文。',
  },
  'zh-TW': {
    badge: '準據法：大韓民國法律',
    notice: 'Debate Code 為非營利性質的對話式線上評判與 AI 技術面試訓練平台。',
    title: '國際使用者核心條款摘要說明',
    items: [
      { title: '100% 免費軟體', desc: '無任何隱藏付費或強制訂閱，所有演算法題庫、評判引擎及技術社群均永久免費開放。' },
      { title: 'AI 答辯免責聲明', desc: 'DebateAI 提出的技術質詢僅為模擬面試輔助工具，不構成招聘或法律擔保。' },
      { title: '智慧財產權歸屬', desc: '您在平台上撰寫的程式碼和討論文章版權均完整歸您個人所有。' },
      { title: '個人資訊隱私安全', desc: '僅加密保存維持服務運作所需的最小限度帳號資料，絕不向第三方擅自提供。' },
    ],
    fullTextNote: '以下內容為具備法律效力的官方韓文協議全文。',
  },
};

export default function LegalLangBanner() {
  const { language } = useLanguage();
  const summary = SUMMARIES[language] ?? SUMMARIES.ko;

  return (
    <div className="mb-8 rounded-[var(--radius-panel)] border border-brand-200 bg-brand-50/50 p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-200/60 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-100 text-brand-800">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
            {summary.badge}
          </span>
          <span className="text-xs text-brand-900/80 hidden sm:inline">{summary.notice}</span>
        </div>
        <div className="shrink-0">
          <LanguageSwitcher />
        </div>
      </div>

      <div>
        <h3 className="font-display text-base sm:text-lg font-bold text-fg mb-3 [word-break:keep-all]">
          {summary.title}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {summary.items.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-brand-100 bg-surface/80 p-3.5">
              <p className="text-xs font-bold text-brand-700 mb-1 [word-break:keep-all]">
                {item.title}
              </p>
              <p className="text-[12.5px] text-fg-secondary leading-relaxed [word-break:keep-all]">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs text-fg-muted font-mono pt-1">
          ℹ️ {summary.fullTextNote}
        </p>
      </div>
    </div>
  );
}
