import type { Metadata } from 'next';
import { prisma } from '@/app/lib/prisma';
import Link from 'next/link';
import { verifySession } from '@/app/lib/dal';
import { createClient } from '@/app/lib/supabase/server';
import { maskSecret } from '@/app/lib/crypto';
import { getFreeUsageSummary } from '@/app/lib/ai/usage-summary';
import { signOutDevice } from '@/app/lib/actions/settings';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import ProfileForm from './profile/profile-form';
import { ensureAnonymousTag } from '@/app/lib/identity';
import PasswordForm from './account/password-form';
import AppSettingsForm from './app/app-settings-form';
import AiSettingsForm from './ai/settings-form';
import McpTokenPanel from './ai/mcp-token-panel';
import TwoFactor from './security/two-factor';
import SettingsShell from './settings-shell';
import { SettingRow, SettingValue } from './ui';
import DeleteAccount from './delete-account';
import DataSection from './data-section';

export const metadata: Metadata = { title: '설정' };

// user-agent → 사람이 읽기 쉬운 기기/브라우저 라벨 (간단 휴리스틱)
function deviceLabel(ua: string | null): string {
  if (!ua) return '알 수 없는 기기';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '기타 OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '브라우저';
  return `${browser} · ${os}`;
}


// 통합 설정 — 계정 / 커뮤니티 프로필 / 서비스 / AI 제공자를 한 페이지에서 관리한다.
export default async function SettingsPage() {
  const { userId, email } = await verifySession();

  // 로그인된 기기(활성 세션) — auth.sessions에서 조회. 현재 세션은 JWT의 session_id로 식별한다.
  const supabase = await createClient();
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  let currentSessionId: string | null = null;
  try {
    const payload = JSON.parse(
      Buffer.from(authSession?.access_token.split('.')[1] ?? '', 'base64').toString('utf8'),
    ) as { session_id?: string };
    currentSessionId = payload.session_id ?? null;
  } catch {
    currentSessionId = null;
  }
  const devices = await prisma
    .$queryRaw<{ id: string; created_at: Date; updated_at: Date; user_agent: string | null; ip: string | null }[]>`
      SELECT id::text AS id, created_at, updated_at, user_agent, ip::text AS ip
      FROM auth.sessions WHERE user_id = ${userId}::uuid ORDER BY updated_at DESC LIMIT 5`
    .catch(() => [] as { id: string; created_at: Date; updated_at: Date; user_agent: string | null; ip: string | null }[]);

  const freeQuota = await getFreeUsageSummary(userId);
  const aiSessionCount = await prisma.aiSession.count({ where: { userId } });
  // 익명 식별자는 설정 화면에서 처음 보여줄 수 있으므로 여기서 확보해 둔다
  const anonymousTag = await ensureAnonymousTag(userId);

  const [user, loginEvents, webauthnKeys] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true, avatarUrl: true, rankBadgeVisible: true, anonymousTag: true, aiTrainingConsentAt: true,
        emailNotifications: true, preferredLanguage: true, aiCodeModel: true,
        aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true,
        mcpTokenPrefix: true, mcpTokenCreatedAt: true,
        twoFactorRecoveryEmail: true,
        twoFactorRecoveryEmailVerifiedAt: true,
        twoFactorEnabled: true,
      },
    }),
    prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, ipMasked: true, userAgent: true, isNew: true, createdAt: true },
    }),
    prisma.webauthnKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    }),
  ]);

  const icon = (path: string) => (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.6]" aria-hidden>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const categories = [
    {
      id: 'general',
      label: '일반',
      keywords: ['언어', '알림', '이메일', '테마', 'language', 'notification'],
      icon: icon('M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 8v4l2.5 2.5'),
    },
    {
      id: 'profile',
      label: '개인 맞춤 설정',
      keywords: ['프로필', '이름', '아바타', '등급', '익명', 'profile'],
      icon: icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0'),
    },
    {
      id: 'ai',
      label: 'AI 설정',
      keywords: ['AI', 'API', '키', '모델', 'free tier', 'perplexity', 'openai', 'claude', 'gemini', 'grok'],
      icon: icon('M12 4v3M12 17v3M4 12h3M17 12h3M7.8 7.8 6 6M16.2 7.8 18 6M7.8 16.2 6 18M16.2 16.2 18 18M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'),
    },
    {
      id: 'integration',
      label: '로컬 연동',
      keywords: ['MCP', '토큰', 'bridge', 'ollama', 'debateNetwork', '연동'],
      icon: icon('M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2M8.5 12h7'),
    },
    {
      id: 'data',
      label: '데이터 제어',
      keywords: ['데이터', '삭제', '약관', '방침', '개인정보', 'AI Search 대화'],
      icon: icon('M12 4.5c-4 0-7 1.2-7 2.7v9.6c0 1.5 3 2.7 7 2.7s7-1.2 7-2.7V7.2c0-1.5-3-2.7-7-2.7ZM5 7.2c0 1.5 3 2.7 7 2.7s7-1.2 7-2.7'),
    },
    {
      id: 'security',
      label: '보안 및 로그인',
      keywords: ['비밀번호', '기기', '세션', '로그인 기록', 'IP', 'password', 'device'],
      icon: icon('M12 3.5 5 6.3v5.2c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6.3L12 3.5Z'),
    },
    {
      id: 'account',
      label: '계정',
      keywords: ['이메일', '탈퇴', '계정 삭제', 'account', 'delete'],
      icon: icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0'),
    },
  ];

  const panels = {
    general: (
      <AppSettingsForm
        initial={{
          emailNotifications: user.emailNotifications,
          preferredLanguage: user.preferredLanguage ?? '',
          aiCodeModel: user.aiCodeModel ?? '',
        }}
      />
    ),

    profile: (
      <div className="pt-4">
        <ProfileForm
          initial={{
            name: user.name,
            avatarUrl: user.avatarUrl ?? '',
            rankBadgeVisible: user.rankBadgeVisible,
            anonymousTag,
          }}
        />
      </div>
    ),

    ai: (
      <div className="pt-4">
        <AiSettingsForm
          initial={{ aiProvider: user.aiProvider, hasKey: !!user.aiApiKey, keyHint: maskSecret(user.aiApiKey) }}
          freeQuota={{
            used: freeQuota.used,
            limit: freeQuota.limit,
            resetAt: freeQuota.resetAt ? freeQuota.resetAt.toISOString() : null,
            models: freeQuota.models,
          }}
        />
      </div>
    ),

    integration: (
      <div className="pt-4">
        <McpTokenPanel
          prefix={user.mcpTokenPrefix}
          createdAt={user.mcpTokenCreatedAt ? user.mcpTokenCreatedAt.toISOString() : null}
        />
        <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-ink-soft/55">
          <li>로컬 LLM은 debateBridge 또는 debateNetwork로 연결하며 위 토큰이 필요합니다.</li>
          <li>AI를 연결하지 않아도 채점 시스템과 내장 면접관은 그대로 사용할 수 있습니다.</li>
        </ul>
      </div>
    ),

    data: <DataSection aiSessionCount={aiSessionCount} />,

    security: (
      <>
        <SettingRow
          label="비밀번호 변경"
          desc="주기적으로 바꾸면 계정을 더 안전하게 지킬 수 있습니다."
          stacked
          control={<PasswordForm email={email} />}
        />

        <SettingRow
          label="2단계 인증"
          desc="복구 이메일 · 인증 앱(TOTP) · 보안키(WebAuthn)를 함께 관리합니다."
          stacked
          control={
            <TwoFactor
              initialEmail={user.twoFactorRecoveryEmail}
              recoveryVerifiedAt={user.twoFactorRecoveryEmailVerifiedAt?.toISOString() ?? null}
              initialEnabled={user.twoFactorEnabled}
              keys={webauthnKeys.map((k) => ({
                id: k.id,
                name: k.name,
                createdAt: k.createdAt.toISOString(),
              }))}
            />
          }
        />

        <SettingRow
          label="로그인된 기기"
          desc="모르는 기기가 있다면 로그아웃시키고 비밀번호를 변경하세요."
          stacked
          control={
            <>
              <div className="divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10">
              {devices.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-soft/50">활성 세션 정보를 불러올 수 없습니다.</p>
              ) : (
                devices.map((d) => {
                  const isCurrent = d.id === currentSessionId;
                  return (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${isCurrent ? 'bg-emerald-500' : 'bg-ink/20'}`} aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {deviceLabel(d.user_agent)}
                          {isCurrent && (
                            <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              현재 기기
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[11px] text-ink-soft/50">
                          {d.ip ? `IP ${d.ip.replace(/(\d+\.\d+\.\d+)\.\d+/, '$1.x')} · ` : ''}
                          마지막 활동 {new Date(d.updated_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      {!isCurrent && (
                        <form action={signOutDevice} className="ml-auto shrink-0">
                          <input type="hidden" name="sessionId" value={d.id} />
                          <button className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100">
                            로그아웃
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })
              )}
              </div>
              <div className="mt-2 text-right">
                <Link href="/settings/security/logins" className="text-sm text-ink-soft/60 hover:text-ink-soft">더보기</Link>
              </div>
            </>
          }
        />

        <SettingRow
          label="로그인 기록"
          desc="모르는 위치가 있다면 즉시 비밀번호를 변경하세요. IP 원문은 저장하지 않고 마스킹합니다."
          stacked
          control={
            <div className="divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10">
              {loginEvents.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-soft/50">아직 기록된 로그인이 없습니다.</p>
              ) : (
                loginEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${e.isNew ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {deviceLabel(e.userAgent)}
                        {e.isNew && (
                          <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            새 위치
                          </span>
                        )}
                      </p>
                      <p className="font-mono text-[11px] text-ink-soft/50">IP {e.ipMasked}</p>
                    </div>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-soft/50">
                      {new Date(e.createdAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          }
        />
      </>
    ),

    account: (
      <>
        <SettingRow
          label="이메일"
          desc="이메일은 인증 계정이 관리하며 이 화면에서 변경할 수 없습니다."
          control={
            <SettingValue>
              <span data-no-translate>{email}</span>
            </SettingValue>
          }
        />
        <SettingRow
          label="회원 탈퇴"
          desc="계정과 관련된 모든 데이터가 즉시 삭제됩니다. 되돌릴 수 없습니다."
          stacked
          control={<DeleteAccount email={email} />}
        />
      </>
    ),
  };

  return (
    <PageShell width="6xl">
      <PageHeader slug="settings" title="설정" className="mb-8" />
      <SettingsShell categories={categories} panels={panels} />
    </PageShell>
  );
}
