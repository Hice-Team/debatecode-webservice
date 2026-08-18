import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { getSettingsByCategory, maintenanceState, SETTING_DEFS } from '@/app/lib/settings';
import { auditActionLabel } from '@/app/lib/audit';
import { PageHeader, StatGrid, Callout, EmptyRow, BTN_NEUTRAL } from '../ui';

export const metadata: Metadata = { title: '시스템 상태' };

// 매 요청마다 실측한다 — 캐시된 헬스체크는 헬스체크가 아니다
export const dynamic = 'force-dynamic';

type Status = 'ok' | 'degraded' | 'down' | 'unconfigured';

const STATUS_META: Record<Status, { label: string; dot: string; cls: string }> = {
  ok: { label: '정상', dot: 'bg-emerald-500', cls: 'border-emerald-200 bg-emerald-50/50' },
  degraded: { label: '주의', dot: 'bg-amber-500', cls: 'border-amber-200 bg-amber-50/50' },
  down: { label: '장애', dot: 'bg-rose-500', cls: 'border-rose-300 bg-rose-50/60' },
  unconfigured: { label: '미설정', dot: 'bg-ink/25', cls: 'border-ink/10 bg-white' },
};

function configured(...names: string[]): boolean {
  return names.some((n) => Boolean(process.env[n]));
}

/**
 * 헬스 점검 — /api/health와 같은 판단을 서버 컴포넌트 안에서 직접 한다.
 * 자기 자신을 fetch하면 Workers에서 서브리퀘스트 한도와 절대 URL 문제를 떠안게 된다.
 */
async function collectChecks() {
  const started = Date.now();
  let dbLatency: number | null = null;
  let dbError: string | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - started;
  } catch (error) {
    dbError = error instanceof Error ? error.message.slice(0, 160) : '연결 실패';
  }

  const aiProviders: Array<[string, string[]]> = [
    ['OpenAI', ['OPENAI_API_KEY']],
    ['Groq', ['GROQ_API_KEY']],
    ['Google AI', ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY']],
    ['xAI', ['GROK_API_KEY', 'XAI_API_KEY']],
    ['Hugging Face', ['HUGGINGFACE_API_KEY', 'HF_TOKEN']],
    ['Anthropic', ['ANTHROPIC_API_KEY']],
  ];
  const liveAi = aiProviders.filter(([, names]) => configured(...names)).map(([label]) => label);
  const hasSupabase = configured('NEXT_PUBLIC_SUPABASE_URL') && configured('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return [
    {
      key: 'database',
      label: '데이터베이스',
      status: (dbError ? 'down' : dbLatency! > 1000 ? 'degraded' : 'ok') as Status,
      detail: dbError ?? `Supabase Postgres · 왕복 ${dbLatency}ms`,
      hint: dbError
        ? 'DATABASE_URL이 pooler(6543) URL인지, Supabase 프로젝트가 일시중지 상태가 아닌지 확인'
        : undefined,
    },
    {
      key: 'supabase_auth',
      label: 'Supabase 인증',
      status: (hasSupabase ? 'ok' : 'down') as Status,
      detail: hasSupabase ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host : 'NEXT_PUBLIC_SUPABASE_* 미설정',
      hint: hasSupabase
        ? undefined
        : 'NEXT_PUBLIC_* 은 빌드 변수다. wrangler secret이 아니라 빌드 환경변수로 넣어야 한다 (DEPLOY.md)',
    },
    {
      key: 'supabase_service',
      label: 'Supabase 서비스 키',
      status: (configured('SUPABASE_SERVICE_ROLE_KEY') ? 'ok' : 'unconfigured') as Status,
      detail: configured('SUPABASE_SERVICE_ROLE_KEY') ? '설정됨' : '미설정 — 관리자용 Storage/Auth 작업이 실패한다',
    },
    {
      key: 'encryption',
      label: '개인정보 암호화 키',
      status: (configured('AI_SECRET_KEY')
        ? configured('AI_SECRET_KEY_2')
          ? 'ok'
          : 'degraded'
        : 'down') as Status,
      detail: configured('AI_SECRET_KEY')
        ? configured('AI_SECRET_KEY_2')
          ? '1차·2차 키 설정됨'
          : '1차 키만 설정됨'
        : 'AI_SECRET_KEY 미설정',
      hint: configured('AI_SECRET_KEY')
        ? configured('AI_SECRET_KEY_2')
          ? undefined
          : 'AI_SECRET_KEY_2(2차 키) 설정을 권장'
        : '생년월일·개인 API 키 복호화가 전부 실패한다. 최우선 확인',
    },
    {
      key: 'free_ai',
      label: 'Debate Free AI 업스트림',
      status: (liveAi.length === 0 ? 'degraded' : 'ok') as Status,
      detail: liveAi.length === 0 ? '키 없음 — 규칙 기반 폴백으로 동작' : `${liveAi.length}개 가용: ${liveAi.join(', ')}`,
    },
    {
      key: 'email',
      label: '메일 발송',
      status: (configured('RESEND_API_KEY') ? 'ok' : 'unconfigured') as Status,
      detail: configured('RESEND_API_KEY')
        ? `Resend · 발신 ${process.env.EMAIL_FROM || '기본 주소'}`
        : '미설정 — 발송이 dry-run으로 기록만 남는다',
    },
    {
      key: 'webauthn',
      label: '보안키(WebAuthn)',
      status: (configured('NEXT_PUBLIC_WEBAUTHN_RPID') && configured('NEXT_PUBLIC_WEBAUTHN_ORIGIN')
        ? 'ok'
        : 'unconfigured') as Status,
      detail: process.env.NEXT_PUBLIC_WEBAUTHN_RPID || '미설정 — 도메인 불일치로 등록이 실패할 수 있다',
    },
  ];
}

// 시스템 상태 — 배포 후 "지금 서비스가 어떤 상태인가"를 한 화면에서 본다.
export default async function SystemHealthPage() {
  const user = await getUser();
  if (!(await can(user, 'setting.read'))) redirect('/console');

  const canWrite = await can(user, 'setting.write');
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  const [checks, maintenance, overrideCount, recentAudit, load] = await Promise.all([
    collectChecks(),
    maintenanceState(),
    prisma.appSetting.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, actorName: true, action: true, summary: true, createdAt: true },
    }).catch(() => []),
    Promise.all([
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.submission.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.post.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.report.count({ where: { status: 'pending' } }),
    ]),
  ]);

  const [signups24h, submissions24h, posts24h, pendingReports] = load;

  const down = checks.filter((c) => c.status === 'down');
  const degraded = checks.filter((c) => c.status === 'degraded');
  const overall: Status = down.length > 0 ? 'down' : degraded.length > 0 ? 'degraded' : 'ok';

  // 기본값에서 벗어난 기능 플래그 — "누가 뭘 꺼 놨는지"가 장애 조사에서 제일 먼저 필요하다
  const flags = await getSettingsByCategory('flag');
  const offFlags = flags.filter((f) => f.overridden && f.value === false);

  return (
    <div>
      <PageHeader
        eyebrow="SYSTEM HEALTH"
        title="시스템 상태"
        sub="배포 환경의 의존성과 현재 걸려 있는 런타임 설정을 함께 봅니다."
        actions={
          canWrite ? (
            <Link href="/console/system/settings" className={BTN_NEUTRAL}>
              런타임 설정 →
            </Link>
          ) : undefined
        }
      />

      {/* 지금 손대야 할 일이 있으면 맨 위에서 말해 준다 */}
      <div className="mb-5 space-y-2">
        {maintenance.enabled && (
          <Callout tone="warn" title="유지보수 모드가 켜져 있습니다">
            일반 이용자에게는 점검 화면만 보입니다. {maintenance.eta && `종료 예정: ${maintenance.eta}. `}
            <Link href="/console/system/maintenance" className="font-semibold underline underline-offset-2">
              설정으로 이동
            </Link>
          </Callout>
        )}
        {down.length > 0 && (
          <Callout tone="danger" title={`장애 ${down.length}건`}>
            {down.map((c) => c.label).join(', ')} — 아래 항목의 안내를 확인하세요.
          </Callout>
        )}
        {offFlags.length > 0 && (
          <Callout tone="info" title={`꺼져 있는 기능 ${offFlags.length}개`}>
            {offFlags.map((f) => f.def.label).join(', ')} — 의도한 것이 맞는지 확인하세요.
          </Callout>
        )}
        {overall === 'ok' && !maintenance.enabled && offFlags.length === 0 && (
          <Callout tone="ok" title="정상">
            모든 의존성이 정상이고, 꺼 둔 기능이 없습니다.
          </Callout>
        )}
      </div>

      <StatGrid
        stats={[
          { label: '24h 가입', value: signups24h },
          { label: '24h 제출', value: submissions24h },
          { label: '24h 게시글', value: posts24h },
          { label: '미처리 신고', value: pendingReports, warn: pendingReports > 0 },
        ]}
      />

      {/* 의존성 점검 */}
      <div className="mt-8">
        <h3 className="mb-3 text-lg font-bold text-ink">의존성</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {checks.map((check) => {
            const meta = STATUS_META[check.status];
            return (
              <div key={check.key} className={`rounded-2xl border p-4 ${meta.cls}`}>
                <div className="flex items-center gap-2">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                  <p className="font-semibold text-ink">{check.label}</p>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-soft/45">
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1.5 break-words text-xs text-ink-soft/70">{check.detail}</p>
                {check.hint && (
                  <p className="mt-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-soft/75">
                    → {check.hint}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 런타임 설정 요약 + 최근 변경 */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-2xl border border-ink/10 bg-white p-5">
          <h3 className="text-lg font-bold text-ink">런타임 설정</h3>
          <p className="mt-1 text-xs text-ink-soft/55">
            전체 {SETTING_DEFS.length}개 중 <strong className="text-ink">{overrideCount}개</strong>가 기본값에서 변경돼
            있습니다.
          </p>
          <p className="mt-3 rounded-xl bg-paper/60 px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft/65">
            여기 있는 값은 재배포 없이 즉시 반영됩니다. 특정 기능만 오류가 나면 그 기능 플래그를 끄고, 외부 AI가
            죽으면 공급자를 바꾸고, 전면 장애면 유지보수 모드를 켜세요.
          </p>
          {canWrite && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/console/system/settings" className={BTN_NEUTRAL}>
                설정 열기
              </Link>
              <Link href="/console/system/maintenance" className={BTN_NEUTRAL}>
                유지보수 모드
              </Link>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3">
            <h3 className="text-sm font-bold text-ink">최근 운영 변경</h3>
            <Link href="/console/access/audit" className="font-mono text-[11px] text-brand-600 hover:underline">
              전체 감사 로그 →
            </Link>
          </div>
          {recentAudit.length === 0 ? (
            <EmptyRow text="아직 기록된 변경이 없습니다." />
          ) : (
            <ul className="divide-y divide-ink/5">
              {recentAudit.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5 px-5 py-2.5">
                  <span className="shrink-0 rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink-soft/55">
                    {auditActionLabel(entry.action)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-soft/75">{entry.summary}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-soft/35">{entry.actorName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
