import type { Metadata } from 'next';
import { prisma } from '@/app/lib/prisma';
import { verifySession, getUser } from '@/app/lib/dal';
import { createClient } from '@/app/lib/supabase/server';
import { maskSecret } from '@/app/lib/crypto';
import { getFreeUsageSummary } from '@/app/lib/ai/usage-summary';
import { getTwoFactorState } from '@/app/lib/two-factor';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import ProfileForm from './profile/profile-form';
import { ensureAnonymousTag } from '@/app/lib/identity';
import AppSettingsForm from './app/app-settings-form';
import AiSettingsForm from './ai/settings-form';
import AiPersonalization from './ai/personalization';
import McpTokenPanel from './ai/mcp-token-panel';
import SettingsShell from './settings-shell';
import DataSection from './data-section';
import AccountSecurity, { type DeviceRow } from './account-security';
import AccessibilitySection from './accessibility-section';
import {
  DEFAULT_CONTEXT_MODE,
  DEFAULT_DATE_FORMAT,
  isContextMode,
  parseEditorPrefs,
  parseInstructions,
  parseNotifyPrefs,
  type ChatLanguage,
  type ProfileVisibility,
} from '@/app/lib/user-prefs';

export const metadata: Metadata = { title: '설정' };

// 통합 설정 — 한 번에 한 갈래만 보여 주고, 각 갈래의 내용은 여기서 만들어 넘긴다.
export default async function SettingsPage() {
  const { userId, email } = await verifySession();
  // 앱 쪽 계정 행이 있는지 먼저 확인한다. 없으면 아래 조회들이 차례로 터지는데,
  // 이 페이지에는 오류 경계도 없어서 "설정에 아예 못 들어간다"로 보였다.
  // getUser()는 그런 반쪽 계정을 복구 경로(/auth/recover)로 보낸다.
  await getUser();

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
    .$queryRaw<DeviceRow[]>`
      SELECT id::text AS id, created_at, updated_at, user_agent, ip::text AS ip
      FROM auth.sessions WHERE user_id = ${userId}::uuid ORDER BY updated_at DESC LIMIT 5`
    .catch(() => [] as DeviceRow[]);

  // 연결된 소셜 계정 — 어떤 길로 이 계정에 들어올 수 있는지 보여 준다
  const identities = await prisma
    .$queryRaw<{ provider: string; created_at: Date }[]>`
      SELECT provider, created_at FROM auth.identities
      WHERE user_id = ${userId}::uuid ORDER BY created_at ASC`
    .catch(() => [] as { provider: string; created_at: Date }[]);

  const freeQuota = await getFreeUsageSummary(userId);
  // 탈퇴 화면이 어떤 2차 인증 수단을 물어볼지 미리 알아야 한다
  const twoFactor = await getTwoFactorState(userId);
  // 익명 식별자는 설정 화면에서 처음 보여줄 수 있으므로 여기서 확보해 둔다
  const anonymousTag = await ensureAnonymousTag(userId);

  const [user, loginEvents, webauthnKeys, counts] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true, avatarUrl: true, rankBadgeVisible: true, anonymousTag: true,
        aiTrainingConsentAt: true, createdAt: true,
        emailNotifications: true, preferredLanguage: true, aiCodeModel: true, aiSearchModel: true,
        aiInstructions: true, aiContextMode: true,
        timezone: true, dateFormat: true, country: true, editorPrefs: true, notifyPrefs: true,
        profileGoal: true, profileVisibility: true, chatLanguage: true,
        aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true,
        mcpTokenPrefix: true, mcpTokenCreatedAt: true,
        twoFactorRecoveryEmail: true,
        twoFactorRecoveryEmailVerifiedAt: true,
        twoFactorEnabled: true,
        emailVerifiedAt: true,
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
    // 데이터 제어가 "무엇이 얼마나 있는지"를 먼저 보여 준다 — 모르고 지우게 두지 않는다
    Promise.all([
      prisma.runAttempt.count({ where: { userId } }),
      prisma.submission.count({ where: { userId } }),
      prisma.post.count({ where: { authorId: userId } }),
      prisma.comment.count({ where: { authorId: userId } }),
      prisma.aiSession.count({ where: { userId } }),
      prisma.debateAiChat.count({ where: { userId } }),
      prisma.bookmark.count({ where: { userId } }),
    ]).then(([activityLogs, submissions, posts, comments, aiSessions, debateChats, bookmarks]) => ({
      activityLogs, submissions, posts, comments, aiSessions, debateChats, bookmarks,
    })),
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
      keywords: ['언어', '알림', '이메일', '시간대', '날짜', '에디터', '글꼴', 'language', 'notification'],
      icon: icon('M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 8v4l2.5 2.5'),
    },
    {
      id: 'profile',
      label: '개인 맞춤 설정',
      keywords: ['프로필', '이름', '아바타', '등급', '익명', '공개 범위', '목표', 'profile'],
      icon: icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0'),
    },
    {
      id: 'ai',
      label: 'AI 설정',
      keywords: ['AI', 'API', '키', '모델', '지침', '맥락', 'free tier', 'openai', 'claude', 'gemini'],
      icon: icon('M12 4v3M12 17v3M4 12h3M17 12h3M7.8 7.8 6 6M16.2 7.8 18 6M7.8 16.2 6 18M16.2 16.2 18 18M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z'),
    },
    {
      id: 'integration',
      label: '로컬 연동',
      keywords: ['MCP', '토큰', 'bridge', 'ollama', 'debateNetwork', '파일시스템', '연동'],
      icon: icon('M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2M8.5 12h7'),
    },
    {
      id: 'accessibility',
      label: '접근성 및 표시',
      keywords: ['테마', '다크', '고대비', '움직임', '모션', '낭독', 'TTS', '접근성', 'accessibility'],
      icon: icon('M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM8.5 12h7M12 8.5v7'),
    },
    {
      id: 'data',
      label: '데이터 제어',
      keywords: ['데이터', '내보내기', '삭제', '캐시', '약관', '방침', '개인정보', '학습 활용'],
      icon: icon('M12 4.5c-4 0-7 1.2-7 2.7v9.6c0 1.5 3 2.7 7 2.7s7-1.2 7-2.7V7.2c0-1.5-3-2.7-7-2.7ZM5 7.2c0 1.5 3 2.7 7 2.7s7-1.2 7-2.7'),
    },
    {
      id: 'security',
      label: '계정 및 보안',
      keywords: ['비밀번호', '이메일', '2단계', '기기', '세션', '로그인 기록', '소셜', '탈퇴', 'password'],
      icon: icon('M12 3.5 5 6.3v5.2c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6.3L12 3.5Z'),
    },
  ];

  const panels = {
    general: (
      <AppSettingsForm
        initial={{
          emailNotifications: user.emailNotifications,
          preferredLanguage: user.preferredLanguage ?? '',
          timezone: user.timezone ?? '',
          dateFormat: user.dateFormat ?? DEFAULT_DATE_FORMAT,
          country: user.country ?? '',
          editor: parseEditorPrefs(user.editorPrefs),
          notify: parseNotifyPrefs(user.notifyPrefs),
        }}
      />
    ),

    profile: (
      <ProfileForm
        initial={{
          name: user.name,
          email,
          joinedAt: user.createdAt.toLocaleDateString('ko-KR', { dateStyle: 'long' }),
          avatarUrl: user.avatarUrl ?? '',
          rankBadgeVisible: user.rankBadgeVisible,
          anonymousTag,
          goal: user.profileGoal ?? '',
          visibility: (user.profileVisibility ?? 'public') as ProfileVisibility,
          chatLanguage: (user.chatLanguage ?? 'auto') as ChatLanguage,
        }}
      />
    ),

    ai: (
      <div className="pt-4">
        <AiPersonalization
          initial={{
            codeModel: user.aiCodeModel ?? '',
            searchModel: user.aiSearchModel ?? '',
            contextMode: isContextMode(user.aiContextMode) ? user.aiContextMode : DEFAULT_CONTEXT_MODE,
            instructions: parseInstructions(user.aiInstructions),
          }}
          sessionCount={counts.aiSessions}
        />
        <div className="mt-10 border-t border-hairline pt-6">
          <AiSettingsForm
            initial={{ aiProvider: user.aiProvider, hasKey: !!user.aiApiKey, keyHint: maskSecret(user.aiApiKey) }}
            freeQuota={{
              used: freeQuota.used,
              limit: freeQuota.limit,
              resetAt: freeQuota.resetAt ? freeQuota.resetAt.toISOString() : null,
              models: freeQuota.models,
              allowance: {
                ...freeQuota.allowance,
                aiSearch: {
                  ...freeQuota.allowance.aiSearch,
                  resetAt: freeQuota.allowance.aiSearch.resetAt?.toISOString() ?? null,
                },
              },
            }}
          />
        </div>
      </div>
    ),

    integration: (
      <div className="pt-4">
        <McpTokenPanel
          prefix={user.mcpTokenPrefix}
          createdAt={user.mcpTokenCreatedAt ? user.mcpTokenCreatedAt.toISOString() : null}
        />
      </div>
    ),

    accessibility: <AccessibilitySection />,

    data: (
      <DataSection counts={counts} trainingConsent={!!user.aiTrainingConsentAt} />
    ),

    security: (
      <AccountSecurity
        email={email}
        identities={identities.map((i) => ({ provider: i.provider, createdAt: i.created_at }))}
        emailVerifiedAt={user.emailVerifiedAt?.toISOString() ?? null}
        twoFactor={{
          recoveryEmail: user.twoFactorRecoveryEmail,
          recoveryVerifiedAt: user.twoFactorRecoveryEmailVerifiedAt?.toISOString() ?? null,
          enabled: user.twoFactorEnabled,
        }}
        webauthnKeys={webauthnKeys.map((k) => ({
          id: k.id,
          name: k.name,
          createdAt: k.createdAt.toISOString(),
        }))}
        devices={devices}
        currentSessionId={currentSessionId}
        loginEvents={loginEvents}
        deleteGuard={{
          totp: twoFactor.totp,
          securityKeys: twoFactor.securityKeys,
          backupCodesLeft: twoFactor.backupCodesLeft,
        }}
      />
    ),
  };

  return (
    <PageShell width="6xl">
      <PageHeader slug="settings" title="설정" className="mb-8" />
      <SettingsShell categories={categories} panels={panels} />
    </PageShell>
  );
}
