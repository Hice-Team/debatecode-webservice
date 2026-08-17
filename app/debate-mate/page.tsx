import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import I18nSlot from '@/app/components/i18n-slot';
import { isBuiltinLive } from '@/app/lib/ai/builtin';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import MateApply from '@/app/dashboard/mate-apply';

export const metadata: Metadata = { title: '디베이트메이트' };

// 디베이트메이트 소개 + 신청 + debateQ 진입 (통합 페이지). 헤더 메뉴에서 진입.
export default async function DebateMatePage() {
  const session = await getSessionOptional();

  let mateStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'mate' = 'none';
  let isMateOrAdmin = false;
  if (session) {
    const [user, app] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, debateQAccess: true } }),
      prisma.debateMateApplication.findUnique({ where: { userId: session.userId }, select: { status: true } }),
    ]);
    const isMate = user?.role === 'debate_mate' || user?.role === 'admin';
    mateStatus = isMate ? 'mate' : ((app?.status as 'pending' | 'approved' | 'rejected' | undefined) ?? 'none');
    isMateOrAdmin = isMate;
  }

  const perks = [
    { title: '문제 출제 · 저작권', desc: '직접 알고리즘 문제를 출제합니다. 저작권은 창작자에게 있으며, 원하면 기증 위임서로 debateCode에 기증할 수도 있습니다.' },
    { title: '활동 보상 · 디베이트포인트', desc: '출제 승인·답변 채택·홍보 인증이 완료되면 포인트가 적립되고, 디베이트샵에서 기프티콘으로 교환할 수 있습니다.' },
    { title: '검토·게시 파이프라인', desc: '제출한 초안은 검토자 승인 후 문제 은행에 게시되고, 관리 콘솔에서 검토 현황을 추적합니다.' },
    { title: '운영 콘솔 접근', desc: '내 출제 초안 관리와 문제 조회 현황을 대시보드 관리 콘솔에서 확인합니다.' },
    { title: '디베이트포인트 제공', desc: '출제 횟수, 문제 은행 기여도, 저작권 양도, 검토 참여 등 활동에 따라 기프티콘 교환 가능한 디베이트포인트를 제공합니다.'}
  ];

  const live = isBuiltinLive();

  return (
    <PageShell width="4xl">
      <PageHeader slug="debate-mate" title="디베이트메이트" className="mb-6" />

      {/* 히어로 */}
      <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white p-8">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
          <I18nSlot k="mate-program" fallback="MATE PROGRAM" />
        </span>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          <I18nSlot k="mate-hero-title" fallback="함께 문제를 만들고, 포인트를 얻으세요" />
        </h2>
        <p className="mt-3 text-sm text-ink-soft/70 leading-relaxed max-w-2xl">
          <I18nSlot
            k="mate-hero-desc"
            fallback="디베이트메이트는 디베이트코드의 문제를 직접 출제하고, 토론·학습 커뮤니티의 성장에 함께하는 파트너 프로그램입니다. 활동에 따라 디베이트포인트가 지급되며, 적립한 포인트는 다양한 기프티콘으로 교환할 수 있습니다. 디베이트메이트만을 위한 다양한 혜택과 프로그램도 준비하고 있습니다."
          />
        </p>
      </section>

      {/* 혜택 소개 */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {perks.map((p, idx) => (
          <div key={p.title} className="rounded-2xl border border-ink/10 bg-white p-5">
            <p className="font-bold text-ink">
              <I18nSlot k={`mate-perk-${idx + 1}-title`} fallback={p.title} />
            </p>
            <p className="mt-1.5 text-sm text-ink-soft/60 leading-relaxed">
              <I18nSlot k={`mate-perk-${idx + 1}-desc`} fallback={p.desc} />
            </p>
          </div>
        ))}
      </div>

      {/* 활동 약관 — 신청 전/후 모두 확인할 수 있도록 상시 노출 */}
      <Link
        href="/legal/mate-terms"
        className="mt-6 flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-5 py-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
      >
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.6]">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" strokeLinejoin="round" />
            <path d="M14 3v5h5M8.5 13h7M8.5 16.5h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">
            <I18nSlot k="mate-terms-cta" fallback="디베이트메이트 활동 약관 보기" />
          </span>
          <span className="mt-0.5 block text-xs text-ink-soft/55">
            <I18nSlot
              k="mate-terms-desc"
              fallback="저작권·포인트 지급 기준·디베이트샵 교환 규정을 확인하세요."
            />
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-ink-soft/30">→</span>
      </Link>

      {/* 디베이트메이트 신청 */}
      {isMateOrAdmin ? (
        <div className="mt-6 rounded-2xl border border-brand-300 bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-wider text-brand-200">MATE CONSOLE</p>
              <p className="mt-1 text-xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                <I18nSlot k="mate-console-title" fallback="활동 콘솔이 열려 있습니다" />
              </p>
              <p className="mt-1.5 text-xs text-white/70">
                <I18nSlot
                  k="mate-console-desc"
                  fallback="출제·검토 현황과 디베이트포인트, 디베이트샵을 한곳에서 관리하세요."
                />
              </p>
            </div>
            <Link href="/debate-mate/console" className="shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50 active:scale-[0.98]">
              <I18nSlot k="mate-console-cta" fallback="디베이트메이트 활동 콘솔로 이동하기 →" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-6">
          <h3 className="text-sm font-bold text-ink mb-1">
            <I18nSlot k="mate-apply-title" fallback="디베이트메이트 신청" />
          </h3>
          {session ? (
            <>
              <p className="mb-4 text-xs text-ink-soft/55">
                <I18nSlot k="mate-apply-desc" fallback="지원을 위해 아래 파일을 작성 후 파일을 제출해주세요.   " /> 
                <a href="/docs/디베이트메이트_신청서.docx" download className="text-brand-600 hover:underline">
                  <I18nSlot k="mate-apply-download" fallback="지원서 다운로드" />
                </a>
              </p>
              <MateApply status={mateStatus} />
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-ink-soft/60">
                <I18nSlot k="mate-apply-login-required" fallback="디베이트메이트 신청은 로그인 후 가능합니다." />
              </p>
              <Link href="/login" className="inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-500">
                <I18nSlot k="login-to-apply" fallback="로그인하고 신청하기" />
              </Link>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
