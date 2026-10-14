'use client';

// 다단계 가입 위저드 — 약관 동의 → 계정 정보 → 프로필 → 환영.
//
// 이메일 인증 단계는 없앴다. 코드가 오지 않으면 가입 자체가 막혔고, 그 실패는 우리 로그에도
// 남지 않았다. 대신 마지막 단계를 마쳐야 계정이 만들어지고(app/lib/actions/signup.ts),
// 중간에 이탈해도 12시간 안에 돌아오면 입력값이 그대로 남아 있다.
//
// 소셜 가입은 동의 단계의 OAuth 버튼으로 진입하며, 콜백 후 계정 단계부터 재개된다.
// 이때는 이메일·비밀번호를 묻지 않는다(이미 소셜 계정이 정한다).
import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  recordSignupConsent,
  saveSignupAccount,
  saveSignupProfile,
  signupWithOAuth,
  type ConsentState,
  type AccountStepState,
  type ProfileStepState,
} from '@/app/lib/actions/signup';
import { confirmVerificationEmail, sendVerificationEmail } from '@/app/lib/actions/signup-extras';
import OAuthButtons from '../oauth-buttons';
import {
  GENDER_OPTIONS,
  POSITION_OPTIONS,
  INTEREST_OPTIONS,
  REFERRAL_OPTIONS,
  MAX_INTERESTS,
} from './options';

type Step = 'consent' | 'account' | 'profile' | 'welcome';

const STEP_ORDER: Step[] = ['consent', 'account', 'profile', 'welcome'];
const STEP_LABELS: Record<Step, string> = {
  consent: '약관 동의',
  account: '계정 정보',
  profile: '프로필',
  welcome: '완료',
};

const inputClass =
  'w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-3 text-sm text-fg placeholder:text-fg-quiet focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25';
const labelClass = 'block font-mono text-xs text-fg-secondary tracking-wider mb-1.5';
const primaryBtnClass =
  'w-full rounded-full bg-signal py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50 disabled:pointer-events-none';
const errorTextClass = 'mt-1.5 text-xs text-rose-600';
const formErrorClass =
  'rounded-[var(--radius-card)] border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-700';

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className={errorTextClass}>{messages[0]}</p>;
}

function FormError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className={formErrorClass}>{messages[0]}</p>;
}

/* ---------- 진행 표시기 ---------- */

function Stepper({ current }: { current: Step }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {STEP_ORDER.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={step} className="flex flex-col items-center gap-1.5 flex-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] transition-colors ${
                  done
                    ? 'bg-signal text-white'
                    : active
                      ? 'bg-brand-600 text-white'
                      : 'bg-paper text-fg-quiet border border-hairline'
                }`}
              >
                {done ? '✓' : String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={`text-[11px] ${active ? 'text-fg font-semibold' : 'text-fg-quiet'} hidden sm:block`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-1 rounded-full bg-paper overflow-hidden">
        <div
          className="h-full rounded-full bg-signal transition-colors duration-500 ease-out"
          style={{ width: `${(currentIdx / (STEP_ORDER.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ---------- 1단계: 약관 동의 ---------- */

const REQUIRED_TERMS = [
  { key: 'terms', href: '/legal/terms', label: '서비스 이용약관' },
  { key: 'privacy', href: '/legal/privacy', label: '개인정보처리방침' },
  { key: 'personal', href: '/legal/consent', label: '개인정보 수집·이용 동의' },
] as const;

function ConsentStep({
  marketing,
  setMarketing,
  onNext,
  oauthError,
}: {
  marketing: boolean;
  setMarketing: (v: boolean) => void;
  onNext: () => void;
  oauthError?: string;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allRequired = REQUIRED_TERMS.every((t) => checked[t.key]);
  const allChecked = allRequired && marketing;

  // 동의 시점에 초안이 만들어진다 — 여기서부터 이탈해도 12시간 안에 이어서 할 수 있다
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(recordSignupConsent, {});
  useEffect(() => {
    if (state.recorded) onNext();
  }, [state.recorded, onNext]);

  const toggleAll = (v: boolean) => {
    setChecked(Object.fromEntries(REQUIRED_TERMS.map((t) => [t.key, v])));
    setMarketing(v);
  };

  // py-2.5 — 동의 항목은 체크박스가 아니라 줄 전체가 누르는 자리다.
  // 줄 높이가 20px이면 손가락으로 옆 항목을 같이 누르게 된다.
  const rowClass = 'flex cursor-pointer items-start gap-2.5 py-2.5 text-sm text-fg-secondary';
  const checkboxClass = 'mt-0.5 h-4 w-4 accent-[#4531d9]';

  return (
    <div className="space-y-5">
      {oauthError && <FormError messages={[oauthError]} />}

      <div>
        <h2 className="text-lg font-bold text-fg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          약관에 동의해 주세요
        </h2>
        <p className="mt-1 text-sm text-fg-muted">서비스 이용을 위해 필수 약관 동의가 필요합니다.</p>
      </div>

      <label className={`${rowClass} rounded-lg border border-hairline bg-paper/50 px-4 py-3 font-semibold text-fg`}>
        <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} className={checkboxClass} />
        <span>전체 동의 (선택 항목 포함)</span>
      </label>

      <div className="space-y-3 px-1">
        {REQUIRED_TERMS.map((t) => (
          <label key={t.key} className={rowClass}>
            <input
              type="checkbox"
              checked={!!checked[t.key]}
              onChange={(e) => setChecked((c) => ({ ...c, [t.key]: e.target.checked }))}
              className={checkboxClass}
            />
            <span>
              <span className="font-mono text-[11px] text-signal mr-1.5">[필수]</span>
              <Link
                href={t.href}
                target="_blank"
                className="-my-3.5 inline-block py-3.5 underline underline-offset-2 hover:text-fg"
              >
                {t.label}
              </Link>
              에 동의합니다.
            </span>
          </label>
        ))}
        <label className={rowClass}>
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className={checkboxClass}
          />
          <span>
            <span className="font-mono text-[11px] text-fg-quiet mr-1.5">[선택]</span>
            새 문제·이벤트 등 마케팅 정보 수신에 동의합니다.
          </span>
        </label>
      </div>

      <FormError messages={state.errors?.form} />

      <form action={formAction}>
        {marketing && <input type="hidden" name="marketing" value="on" />}
        <button type="submit" disabled={!allRequired || pending} className={primaryBtnClass}>
          {pending ? '저장 중…' : '동의하고 계속하기'}
        </button>
      </form>

      {/* 간편 가입 — 동의를 마쳐야 열린다. 동의 상태는 쿠키로 보존돼 콜백에서 기록된다. */}
      {allRequired ? (
        <OAuthButtons action={signupWithOAuth.bind(null, marketing)} heading="간편 가입" />
      ) : (
        <p className="text-center text-xs text-fg-quiet">
          필수 약관에 동의하면 소셜 계정으로도 가입할 수 있습니다.
        </p>
      )}
    </div>
  );
}

/* ---------- 선택 칩 ---------- */

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        selected
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-hairline bg-surface text-fg-secondary hover:border-fg-quiet'
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- 2단계: 계정 정보 ---------- */

// requiresPassword=false는 소셜 가입이다. 이메일과 비밀번호는 소셜 계정이 정하므로
// 입력칸 자체를 그리지 않는다 — 비워 둔 칸을 보여 주면 "여기도 채워야 하나" 하고 멈춘다.
function AccountStep({
  requiresPassword,
  initialEmail,
  initialNickname,
  initialBirthdate,
  initialGender,
  resumableByEmail,
  onSaved,
}: {
  requiresPassword: boolean;
  initialEmail: string;
  initialNickname: string;
  initialBirthdate: string;
  initialGender: string;
  /** 같은 IP에 진행 중이던 초안이 있다 — 이메일을 맞게 넣으면 이어진다 */
  resumableByEmail: boolean;
  onSaved: (nickname: string) => void;
}) {
  const [state, formAction, pending] = useActionState<AccountStepState, FormData>(saveSignupAccount, {});
  const [showPassword, setShowPassword] = useState(false);
  const [gender, setGender] = useState(initialGender);
  const nicknameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.saved) onSaved(nicknameRef.current?.value.trim() ?? '');
  }, [state.saved, onSaved]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-fg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          계정 정보를 입력해 주세요
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {requiresPassword ? '로그인에 사용할 이메일·비밀번호와 기본 정보를 설정합니다.' : '서비스에서 사용할 기본 정보를 설정합니다.'}
        </p>
      </div>

      {resumableByEmail && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          이 네트워크에서 진행하던 가입이 있습니다. 그때 쓴 이메일을 그대로 입력하면 이어서 진행됩니다.
        </p>
      )}

      <form action={formAction} className="space-y-5">
        {requiresPassword && (
          <>
            <div>
              <label htmlFor="email" className={labelClass}>
                EMAIL
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={initialEmail}
                placeholder="you@example.com"
                className={inputClass}
              />
              <FieldError messages={state.errors?.email} />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                PASSWORD
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="영문 + 숫자, 8자 이상"
                  className={`${inputClass} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-fg-muted hover:text-fg"
                >
                  {showPassword ? '숨기기' : '보기'}
                </button>
              </div>
              <FieldError messages={state.errors?.password} />
            </div>

            <div>
              <label htmlFor="passwordConfirm" className={labelClass}>
                PASSWORD CONFIRM
              </label>
              <input
                id="passwordConfirm"
                name="passwordConfirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="비밀번호를 한 번 더 입력"
                className={inputClass}
              />
              <FieldError messages={state.errors?.passwordConfirm} />
            </div>
          </>
        )}

        <div>
          <label htmlFor="nickname" className={labelClass}>
            NICKNAME
          </label>
          <input
            id="nickname"
            name="nickname"
            ref={nicknameRef}
            type="text"
            autoComplete="nickname"
            required
            defaultValue={initialNickname}
            placeholder="debateCode에서 사용할 이름"
            className={inputClass}
          />
          <FieldError messages={state.errors?.nickname} />
        </div>

        <div>
          <label htmlFor="birthdate" className={labelClass}>
            BIRTHDATE
          </label>
          <input
            id="birthdate"
            name="birthdate"
            type="date"
            required
            defaultValue={initialBirthdate}
            className={inputClass}
          />
          <FieldError messages={state.errors?.birthdate} />
        </div>

        <div>
          <span className={labelClass}>GENDER</span>
          <input type="hidden" name="gender" value={gender} />
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((o) => (
              <Chip key={o.value} selected={gender === o.value} onClick={() => setGender(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <FieldError messages={state.errors?.gender} />
        </div>

        <FormError messages={state.errors?.form} />

        <button type="submit" disabled={pending} className={primaryBtnClass}>
          {pending ? '저장 중…' : '다음'}
        </button>
      </form>
    </div>
  );
}

/* ---------- 4단계: 프로필 ---------- */

function ProfileStep({ onSaved, onBack }: { onSaved: (nickname?: string) => void; onBack: () => void }) {
  const [state, formAction, pending] = useActionState<ProfileStepState, FormData>(saveSignupProfile, {});
  const [position, setPosition] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [referral, setReferral] = useState('');

  useEffect(() => {
    if (state.saved) onSaved(state.nickname);
  }, [state.saved, state.nickname, onSaved]);

  const toggleInterest = (value: string) =>
    setInterests((list) =>
      list.includes(value) ? list.filter((v) => v !== value) : list.length >= MAX_INTERESTS ? list : [...list, value],
    );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-fg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          거의 다 왔어요
        </h2>
        <p className="mt-1 text-sm text-fg-muted">맞춤 문제와 면접 질문을 위해 몇 가지만 더 알려주세요.</p>
      </div>

      <form action={formAction} className="space-y-6">
        <div>
          <span className={labelClass}>POSITION — 지망 포지션</span>
          <input type="hidden" name="position" value={position} />
          <div className="flex flex-wrap gap-2">
            {POSITION_OPTIONS.map((o) => (
              <Chip key={o.value} selected={position === o.value} onClick={() => setPosition(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <FieldError messages={state.errors?.position} />
        </div>

        <div>
          <label htmlFor="major" className={labelClass}>
            MAJOR — 전공 (선택)
          </label>
          <input
            id="major"
            name="major"
            type="text"
            placeholder="예: 컴퓨터공학, 비전공"
            className={inputClass}
          />
          <FieldError messages={state.errors?.major} />
        </div>

        <div>
          <span className={labelClass}>
            INTERESTS — 관심 태그 ({interests.length}/{MAX_INTERESTS})
          </span>
          {interests.map((v) => (
            <input key={v} type="hidden" name="interests" value={v} />
          ))}
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((o) => (
              <Chip key={o.value} selected={interests.includes(o.value)} onClick={() => toggleInterest(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <FieldError messages={state.errors?.interests} />
        </div>

        <div>
          <span className={labelClass}>REFERRAL — debateCode를 접하게 된 경로</span>
          <input type="hidden" name="referral" value={referral} />
          <div className="flex flex-wrap gap-2">
            {REFERRAL_OPTIONS.map((o) => (
              <Chip key={o.value} selected={referral === o.value} onClick={() => setReferral(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <FieldError messages={state.errors?.referral} />
        </div>

        <FormError messages={state.errors?.form} />

        <button type="submit" disabled={pending} className={primaryBtnClass}>
          {pending ? '저장 중…' : '가입 완료하기'}
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-fg-quiet hover:text-fg transition-colors"
      >
        ← 계정 정보 수정
      </button>
    </div>
  );
}

/* ---------- 5단계: 환영 ---------- */

/**
 * 가입 마무리 — 선택 설정 세 가지.
 *
 * 계정은 이미 만들어졌다. 여기 있는 것은 전부 **나중에 해도 되는 일**이고, 그 사실을
 * 화면에서 분명히 한다. 예전처럼 인증을 통과해야 들어올 수 있게 만들면 여기서 사람을 잃는다.
 *
 * 그래도 자리를 마련해 둔 이유는, 필요해진 순간에 설정 화면을 찾아 들어가는 사람이
 * 생각보다 적기 때문이다. 지금 한 번은 보여 준다.
 */
function WelcomeStep({ nickname }: { nickname: string }) {
  const [mailState, setMailState] = useState<{ ok?: string; error?: string; sent?: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(false);

  async function sendMail() {
    setSending(true);
    setMailState(null);
    try {
      const result = await sendVerificationEmail();
      setMailState(result);
      // 이미 인증된 계정(소셜 가입 등)이면 입력란을 열 이유가 없다
      if (result.ok && !result.sent) setVerified(true);
    } finally {
      setSending(false);
    }
  }

  async function confirmCode() {
    setConfirming(true);
    try {
      const form = new FormData();
      form.set('code', code);
      const result = await confirmVerificationEmail({}, form);
      setMailState(result);
      if (result.ok && !result.error) {
        setVerified(true);
        setCode('');
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-fg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          {nickname ? `${nickname}님, 환영합니다` : '가입이 끝났습니다'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
          계정이 만들어졌습니다. 아래는 모두 <strong>선택</strong>이며 나중에 설정에서도 할 수 있습니다.
        </p>
      </div>

      <ul className="space-y-3">
        {/* 1. 이메일 인증 — 왜 필요한지 먼저 말한다 */}
        <li className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-4">
          <p className="text-sm font-semibold text-fg">이메일 인증</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
            비밀번호를 잊었을 때 되찾는 길이 되고, 중고 거래는 인증한 계정만 이용할 수 있습니다.
          </p>
          {verified ? (
            <p className="mt-3 text-[13px] font-medium text-emerald-700">인증이 끝났습니다.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={sendMail}
                disabled={sending}
                className="mt-3 rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-fg-secondary transition-colors hover:border-ink/25 disabled:opacity-40"
              >
                {sending ? '보내는 중…' : mailState?.sent ? '코드 다시 보내기' : '인증 코드 보내기'}
              </button>

              {/* 코드 입력란은 실제로 보낸 뒤에만 연다 — 보내기 전에 띄우면
                  무엇을 넣어야 하는지 알 수 없는 빈 칸이 된다 */}
              {mailState?.sent && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="signup-verify-code" className="sr-only">
                    인증 코드 6자리
                  </label>
                  <input
                    id="signup-verify-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="w-32 rounded-[var(--radius-card)] border border-hairline px-3 py-2 text-center font-mono text-[15px] tracking-[0.3em]"
                  />
                  <button
                    type="button"
                    onClick={confirmCode}
                    disabled={confirming || code.length !== 6}
                    className="rounded-full bg-signal px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    {confirming ? '확인 중…' : '확인'}
                  </button>
                </div>
              )}
            </>
          )}

          {mailState?.ok && !mailState.error && (
            <p className="mt-2 text-[12px] text-emerald-700">{mailState.ok}</p>
          )}
          {mailState?.error && (
            <p role="alert" className="mt-2 text-[12px] text-rose-600">
              {mailState.error}
            </p>
          )}
        </li>

        {/* 2. AI 키 — 서비스 기본 모델로도 쓸 수 있다는 점을 분명히 */}
        <li className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-4">
          <p className="text-sm font-semibold text-fg">내 AI 키 등록</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
            등록하지 않아도 무료 모델로 쓸 수 있습니다. 자기 키를 넣으면 일일 한도 없이
            원하는 모델을 씁니다. 키는 암호화해 저장합니다.
          </p>
          <Link
            href="/onboarding/ai"
            className="mt-3 inline-block rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-fg-secondary transition-colors hover:border-ink/25"
          >
            AI 설정하기
          </Link>
        </li>

        {/* 3. 2차 보안 — 등록 흐름(QR 스캔)이 길어서 설정 화면으로 보낸다 */}
        <li className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-4">
          <p className="text-sm font-semibold text-fg">2차 보안</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
            OTP 앱이나 보안키(패스키)를 등록하면 비밀번호가 새더라도 로그인을 막을 수 있습니다.
          </p>
          <Link
            href="/settings#security"
            className="mt-3 inline-block rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-fg-secondary transition-colors hover:border-ink/25"
          >
            보안 설정 열기
          </Link>
        </li>
      </ul>

      <Link href="/dashboard" className={`${primaryBtnClass} block text-center`}>
        건너뛰고 시작하기
      </Link>
    </div>
  );
}

/* ---------- 위저드 본체 ---------- */

export default function SignupWizard({
  initialStep,
  requiresPassword,
  initialEmail,
  initialNickname,
  initialBirthdate,
  initialGender,
  resumableByEmail,
  oauthError,
}: {
  initialStep: Step;
  requiresPassword: boolean;
  initialEmail: string;
  initialNickname: string;
  initialBirthdate: string;
  initialGender: string;
  resumableByEmail: boolean;
  oauthError?: string;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [marketing, setMarketing] = useState(false);
  const [nickname, setNickname] = useState(initialNickname);

  return (
    <div>
      <Stepper current={step} />

      {step === 'consent' && (
        <ConsentStep
          marketing={marketing}
          setMarketing={setMarketing}
          onNext={() => setStep('account')}
          oauthError={oauthError}
        />
      )}

      {step === 'account' && (
        <AccountStep
          requiresPassword={requiresPassword}
          initialEmail={initialEmail}
          initialNickname={initialNickname}
          initialBirthdate={initialBirthdate}
          initialGender={initialGender}
          resumableByEmail={resumableByEmail}
          onSaved={(name) => {
            if (name) setNickname(name);
            setStep('profile');
          }}
        />
      )}

      {step === 'profile' && (
        <ProfileStep
          onSaved={(name) => {
            if (name) setNickname(name);
            setStep('welcome');
          }}
          onBack={() => setStep('account')}
        />
      )}

      {step === 'welcome' && <WelcomeStep nickname={nickname} />}
    </div>
  );
}
