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
  'w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm text-ink-soft placeholder:text-ink-soft/30 focus:outline-none focus:ring-2 focus:ring-signal/60 focus:border-signal';
const labelClass = 'block font-mono text-xs text-ink-soft/60 tracking-wider mb-1.5';
const primaryBtnClass =
  'w-full rounded-lg bg-brand-600 text-white font-semibold py-3 hover:bg-brand-500 transition-colors disabled:opacity-50 disabled:pointer-events-none';
const errorTextClass = 'mt-1.5 text-xs text-rose-600';
const formErrorClass = 'text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5';

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
                      : 'bg-ink/5 text-ink-soft/40 border border-ink/10'
                }`}
              >
                {done ? '✓' : String(i + 1).padStart(2, '0')}
              </span>
              <span
                className={`text-[11px] ${active ? 'text-ink-soft font-semibold' : 'text-ink-soft/40'} hidden sm:block`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="h-1 rounded-full bg-ink/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-signal transition-all duration-500 ease-out"
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

  const rowClass = 'flex items-start gap-2.5 text-sm text-ink-soft/70 cursor-pointer';
  const checkboxClass = 'mt-0.5 h-4 w-4 accent-[#4531d9]';

  return (
    <div className="space-y-5">
      {oauthError && <FormError messages={[oauthError]} />}

      <div>
        <h2 className="text-lg font-bold text-ink-soft" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          약관에 동의해 주세요
        </h2>
        <p className="mt-1 text-sm text-ink-soft/50">서비스 이용을 위해 필수 약관 동의가 필요합니다.</p>
      </div>

      <label className={`${rowClass} rounded-lg border border-ink/15 bg-paper/50 px-4 py-3 font-semibold text-ink-soft`}>
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
              <Link href={t.href} target="_blank" className="underline underline-offset-2 hover:text-ink-soft">
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
            <span className="font-mono text-[11px] text-ink-soft/40 mr-1.5">[선택]</span>
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
        <p className="text-center text-xs text-ink-soft/40">
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
          : 'border-ink/15 bg-white text-ink-soft/70 hover:border-ink/40'
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
        <h2 className="text-lg font-bold text-ink-soft" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          계정 정보를 입력해 주세요
        </h2>
        <p className="mt-1 text-sm text-ink-soft/50">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-soft/50 hover:text-ink-soft"
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
        <h2 className="text-lg font-bold text-ink-soft" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          거의 다 왔어요
        </h2>
        <p className="mt-1 text-sm text-ink-soft/50">맞춤 문제와 면접 질문을 위해 몇 가지만 더 알려주세요.</p>
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
        className="w-full text-center text-xs text-ink-soft/40 hover:text-ink-soft transition-colors"
      >
        ← 계정 정보 수정
      </button>
    </div>
  );
}

/* ---------- 5단계: 환영 ---------- */

function WelcomeStep({ nickname }: { nickname: string }) {
  return (
    <div className="space-y-6 text-center py-4">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-signal/15 text-3xl">🎉</div>
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-brand-600">WELCOME ABOARD</span>
        <h2 className="mt-2 text-2xl font-bold text-ink-soft" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          {nickname ? `${nickname}님, 환영합니다!` : '가입을 환영합니다!'}
        </h2>
        <p className="mt-3 text-sm text-ink-soft/60 leading-relaxed">
          이제 문제를 풀고, DebateAI 면접관 앞에서
          <br />
          당신의 코드를 변호할 차례입니다.
        </p>
      </div>

      <div className="space-y-3">
        <Link href="/onboarding/ai" className={`${primaryBtnClass} block`}>
          DebateAI 면접관 설정하기
        </Link>
        <Link
          href="/dashboard"
          className="block w-full rounded-lg border border-ink/15 bg-white py-3 text-sm font-medium text-ink-soft/70 hover:border-ink/40 transition-colors"
        >
          나중에 하기 — 대시보드로 이동
        </Link>
      </div>
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
