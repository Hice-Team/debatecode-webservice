// 계정 및 보안 — 예전에 "보안 및 로그인"과 "계정" 둘로 나뉘어 있던 것을 하나로 합쳤다.
//
// 나눠 두었을 때의 문제는 경계가 설명되지 않는다는 것이었다. 비밀번호는 보안이고 이메일은
// 계정인데, 이용자 입장에서는 둘 다 "로그인에 쓰는 것"이다. 실제로 비밀번호를 바꾸러 들어와
// 계정 탭을 먼저 열게 되는 순서가 나온다.
//
// 대신 안에서 네 묶음으로 나눈다 — 로그인 수단 / 2단계 인증 / 활동 / 위험 구역.
// 위험 구역을 맨 아래 따로 두는 이유는, 되돌릴 수 없는 것과 매일 쓰는 것이 같은 간격으로
// 늘어서 있으면 손이 미끄러지기 때문이다.
import Link from 'next/link';
import { signOutDevice } from '@/app/lib/actions/settings';
import PasswordForm from './account/password-form';
import EmailVerification from './security/email-verification';
import TwoFactor from './security/two-factor';
import SignOutOthers from './security/sign-out-others';
import DeleteAccount from './delete-account';

/** 소셜 로그인 표기 — auth.identities의 provider 문자열을 사람이 읽는 이름으로 */
const PROVIDER_LABEL: Record<string, string> = {
  email: '이메일 · 비밀번호',
  google: '구글',
  naver: '네이버',
  kakao: '카카오',
  github: '깃허브',
  discord: '디스코드',
  twitter: 'X (트위터)',
  facebook: '페이스북',
  linkedin_oidc: '링크드인',
};

export interface DeviceRow {
  id: string;
  updated_at: Date;
  user_agent: string | null;
  ip: string | null;
}

export interface LoginRow {
  id: string;
  ipMasked: string;
  userAgent: string | null;
  isNew: boolean;
  createdAt: Date;
}

/** user-agent → 사람이 읽기 쉬운 기기/브라우저 라벨 (간단 휴리스틱) */
export function deviceLabel(ua: string | null): string {
  if (!ua) return '알 수 없는 기기';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '기타 OS';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '브라우저';
  return `${browser} · ${os}`;
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-4">
      <h3 className="font-display text-[15px] font-bold tracking-tight text-fg">{title}</h3>
      {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{desc}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  desc,
  control,
  stacked = false,
}: {
  label: React.ReactNode;
  desc?: React.ReactNode;
  control?: React.ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={`border-b border-hairline py-4 last:border-b-0 ${
        stacked ? '' : 'flex flex-wrap items-center gap-x-6 gap-y-2'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{label}</p>
        {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{desc}</p>}
      </div>
      {control && <div className={stacked ? 'mt-3' : 'shrink-0'}>{control}</div>}
    </div>
  );
}

export default function AccountSecurity({
  email,
  identities,
  emailVerifiedAt,
  twoFactor,
  webauthnKeys,
  devices,
  currentSessionId,
  loginEvents,
  deleteGuard,
}: {
  email: string;
  identities: { provider: string; createdAt: Date }[];
  emailVerifiedAt: string | null;
  twoFactor: {
    recoveryEmail: string | null;
    recoveryVerifiedAt: string | null;
    enabled: boolean;
  };
  webauthnKeys: { id: string; name: string | null; createdAt: string }[];
  devices: DeviceRow[];
  currentSessionId: string | null;
  loginEvents: LoginRow[];
  deleteGuard: { totp: boolean; securityKeys: number; backupCodesLeft: number };
}) {
  const otherCount = devices.filter((d) => d.id !== currentSessionId).length;
  const linked = identities.filter((i) => i.provider !== 'email');

  return (
    <div>
      {/* ── 로그인 수단 ─────────────────────────────────────────── */}
      <Group title="로그인 수단" desc="이 계정에 들어오는 길입니다.">
        <Row
          label="이메일"
          desc="인증 계정이 관리하므로 이 화면에서는 바꿀 수 없습니다."
          control={
            <span className="text-sm text-fg-secondary" data-no-translate>
              {email}
            </span>
          }
        />

        <Row
          label="연결된 소셜 계정"
          desc={
            linked.length > 0
              ? '아래 계정으로도 로그인할 수 있습니다. 연결 해제는 고객센터로 문의해 주세요.'
              : '소셜 계정으로 처음 로그인하면 이 계정에 자동으로 연결됩니다.'
          }
          stacked
          control={
            linked.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-dashed border-hairline px-4 py-5 text-center text-[13px] text-fg-muted">
                아직 연결된 소셜 계정이 없습니다. 비밀번호로만 로그인합니다.
              </p>
            ) : (
              <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline">
                {linked.map((i) => (
                  <li key={i.provider} className="flex min-h-[52px] items-center gap-3 px-4 py-3">
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <span className="min-w-0 flex-1 text-sm font-medium text-fg">
                      {PROVIDER_LABEL[i.provider] ?? i.provider}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                      {i.createdAt.toLocaleDateString('ko-KR', { dateStyle: 'medium' })} 연결
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        />

        <Row
          label="비밀번호 변경"
          desc="주기적으로 바꾸면 계정을 더 안전하게 지킬 수 있습니다."
          stacked
          control={<PasswordForm email={email} />}
        />

        <Row
          label="이메일 인증"
          desc="이 주소를 실제로 받아볼 수 있는지 확인합니다. 중고 거래와 일부 게시판 답변에 필요합니다."
          stacked
          control={<EmailVerification email={email} verifiedAt={emailVerifiedAt} />}
        />
      </Group>

      {/* ── 2단계 인증 ──────────────────────────────────────────── */}
      <Group
        title="2단계 인증"
        desc="비밀번호가 새어 나가도 한 겹이 더 남습니다. 복구 이메일 · 인증 앱 · 보안키를 함께 관리합니다."
      >
        <TwoFactor
          initialEmail={twoFactor.recoveryEmail}
          recoveryVerifiedAt={twoFactor.recoveryVerifiedAt}
          initialEnabled={twoFactor.enabled}
          keys={webauthnKeys}
        />
      </Group>

      {/* ── 활동 ────────────────────────────────────────────────── */}
      <Group title="활동" desc="누가 언제 들어왔는지 확인하고, 모르는 접속은 끊습니다.">
        <Row
          label="로그인된 기기"
          desc={
            otherCount === 0
              ? '지금은 이 기기에서만 로그인돼 있습니다.'
              : `이 기기 외에 ${otherCount}대에서 로그인돼 있습니다. 모르는 기기가 있다면 끊고 비밀번호를 바꾸세요.`
          }
          stacked
          control={
            <>
              <div className="mb-3 flex justify-end">
                <SignOutOthers otherCount={otherCount} />
              </div>
              <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline">
                {devices.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-fg-muted">
                    활성 세션 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
                  </p>
                ) : (
                  devices.map((d) => {
                    const isCurrent = d.id === currentSessionId;
                    return (
                      <div key={d.id} className="flex min-h-[56px] items-center gap-3 px-4 py-3">
                        <span
                          aria-hidden
                          className={`h-2 w-2 shrink-0 rounded-full ${isCurrent ? 'bg-emerald-500' : 'bg-fg-quiet/40'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-fg">
                            {deviceLabel(d.user_agent)}
                            {isCurrent && (
                              <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                현재 기기
                              </span>
                            )}
                          </p>
                          <p className="font-mono text-[11px] text-fg-muted">
                            {d.ip ? `IP ${d.ip.replace(/(\d+\.\d+\.\d+)\.\d+/, '$1.x')} · ` : ''}
                            마지막 활동{' '}
                            {new Date(d.updated_at).toLocaleString('ko-KR', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        </div>
                        {!isCurrent && (
                          <form action={signOutDevice} className="shrink-0">
                            <input type="hidden" name="sessionId" value={d.id} />
                            <button className="dc-tap min-h-9 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100">
                              로그아웃
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          }
        />

        <Row
          label="로그인 기록"
          desc="모르는 위치가 있다면 즉시 비밀번호를 변경하세요. IP 원문은 저장하지 않고 마스킹합니다."
          stacked
          control={
            <>
              <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline">
                {loginEvents.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-fg-muted">아직 기록된 로그인이 없습니다.</p>
                ) : (
                  loginEvents.map((e) => (
                    <div key={e.id} className="flex min-h-[52px] items-center gap-3 px-4 py-3">
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${e.isNew ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg">
                          {deviceLabel(e.userAgent)}
                          {e.isNew && (
                            <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              새 위치
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[11px] text-fg-muted">IP {e.ipMasked}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                        {new Date(e.createdAt).toLocaleString('ko-KR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-end gap-4">
                <a
                  href="/settings/security/log"
                  download
                  className="text-[13px] font-medium text-fg-secondary underline-offset-2 hover:text-fg hover:underline"
                >
                  전체 기록 CSV로 내려받기
                </a>
                <Link
                  href="/settings/security/logins"
                  className="text-[13px] font-medium text-fg-secondary underline-offset-2 hover:text-fg hover:underline"
                >
                  더보기
                </Link>
              </div>
            </>
          }
        />
      </Group>

      {/* ── 위험 구역 ───────────────────────────────────────────── */}
      <section className="mt-10 rounded-[var(--radius-panel)] border border-rose-200 bg-rose-50/50 p-5">
        <h3 className="font-display text-[15px] font-bold tracking-tight text-rose-800">위험 구역</h3>
        <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-rose-900/70">
          여기서 하는 일은 되돌릴 수 없습니다. 먼저 데이터 제어에서 내보내기를 해 두는 것을 권합니다.
        </p>
        <div className="mt-4 rounded-[var(--radius-card)] border border-rose-200 bg-surface p-4">
          <p className="text-sm font-medium text-fg">회원 탈퇴</p>
          <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">
            계정과 관련된 모든 데이터가 즉시 삭제됩니다. 같은 이메일로 다시 가입해도 기록은 돌아오지
            않습니다.
          </p>
          <div className="mt-3">
            <DeleteAccount email={email} guard={deleteGuard} />
          </div>
        </div>
      </section>
    </div>
  );
}
