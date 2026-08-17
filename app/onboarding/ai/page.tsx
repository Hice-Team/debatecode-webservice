import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { verifySession } from '@/app/lib/dal';
import AiSettingsForm from '@/app/settings/ai/settings-form';

export const metadata: Metadata = { title: 'DebateAI 설정' };

export default async function AiOnboardingPage() {
  const { userId } = await verifySession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true },
  });

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600">{'Welcome, ' + user.name}</span>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-ink-soft"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            면접관 DebateAI를 골라주세요
          </h1>
          <p className="mt-2 text-ink-soft/60">
            지금 설정하지 않아도 내장 면접관으로 바로 시작할 수 있습니다. 나중에{' '}
            <span className="font-mono text-xs">설정 &gt; DebateAI</span>에서 언제든 바꿀 수 있어요.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-ink/10 shadow-sm p-8">
          <AiSettingsForm
            initial={{ aiProvider: user.aiProvider, hasKey: !!user.aiApiKey, keyHint: null }}
            redirectTo="/dashboard"
            showSkip
          />
        </div>

        {/* 디베이트메이트 소개 */}
        <section aria-labelledby="ob-mate" className="mt-6 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white p-8">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600">DEBATE MATE</span>
          <h2 id="ob-mate" className="mt-2 text-xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            디베이트메이트 — 함께 문제를 만드는 파트너
          </h2>
          <p className="mt-2 text-sm text-ink-soft/70 leading-relaxed">
            디베이트메이트는 debateCode의 알고리즘 문제를 직접 출제하고 커뮤니티에 기여하는 파트너 프로그램입니다.
            출제한 문제의 저작권은 창작자에게 있으며, 승인되면 심화 트레이닝인 debateQ 모드가 함께 열립니다.
          </p>
          <Link
            href="/debate-mate"
            className="mt-4 inline-block rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500 transition-colors"
          >
            디베이트메이트 자세히 보기 →
          </Link>
        </section>

        {/* debateQ 모드 설명 */}
        <section aria-labelledby="ob-debateq" className="mt-4 rounded-xl border border-ink/10 bg-white p-8">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-600">debateQ</span>
          <h2 id="ob-debateq" className="mt-2 text-xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            debateQ — 코드는 AI가, 판단은 당신이
          </h2>
          <p className="mt-2 text-sm text-ink-soft/70 leading-relaxed">
            debateQ에서는 코드를 직접 작성하지 않습니다. 문제집에서 debateQ 토글을 켜면 시작되며, 오직 생성형
            AI에게 명령을 내려 코드를 만들고, 내장 컴파일러로 실행해 정답과 일치하면 곧바로 AI 면접이 시작됩니다.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-ink-soft/70">
            {[
              'AI에게 명령해 코드를 작성·수정합니다 — 직접 타이핑은 불가',
              '실행 버튼으로 채점 — 모든 테스트를 통과해야 합니다',
              '통과 즉시 면접 모드 전환 — 왜 그렇게 만들었는지 방어하세요',
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 rounded-full bg-brand-50 border border-brand-200 w-5 h-5 flex items-center justify-center font-mono text-[10px] text-brand-700">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
