'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { mapAuthError } from '@/app/lib/auth-errors';
import OAuthButtons from '../oauth-buttons';
import { z } from 'zod';

const emailSchema = z.string().email('올바른 이메일 형식이 아닙니다.');

const SAVED_EMAIL_KEY = 'dc_saved_email';

// 저장된 아이디는 브라우저에만 있다 — 서버 렌더에는 존재하지 않는다.
//
// 예전에는 effect에서 읽어 setState 했는데, 그러면 첫 렌더가 빈 값으로 한 번 그려진 뒤
// 곧바로 다시 그려진다(입력칸이 깜빡인다). React Compiler도 이 패턴을 막는다.
// useSyncExternalStore는 서버 스냅샷을 따로 받으므로 하이드레이션 불일치 없이 첫 렌더에
// 바로 값을 넣을 수 있다. localStorage는 이 페이지가 떠 있는 동안 밖에서 바뀌지 않으므로
// 구독은 아무것도 하지 않는다.
const noopSubscribe = () => () => {};

function readSavedEmail(): string | null {
  try {
    return localStorage.getItem(SAVED_EMAIL_KEY);
  } catch {
    return null; // localStorage가 꺼진 환경(사생활 보호 모드 등)
  }
}

export default function LoginForm({ oauthError }: { oauthError?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const savedEmail = useSyncExternalStore(noopSubscribe, readSavedEmail, () => null);
  // 이용자가 손대기 전에는 저장된 값을 그대로 보여 준다(null = 아직 손대지 않음).
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [rememberInput, setRememberInput] = useState<boolean | null>(null);
  const email = emailInput ?? savedEmail ?? '';
  const remember = rememberInput ?? Boolean(savedEmail);

  const [errors, setErrors] = useState<{
    email?: string[];
    password?: string[];
    form?: string[];
  }>({});

  // 로그인 성공 시: 아이디 저장 + (지원 브라우저라면) 자격증명/패스키 저장 프롬프트
  async function persistCredential(loginEmail: string, password?: string) {
    try {
      if (remember) localStorage.setItem(SAVED_EMAIL_KEY, loginEmail);
      else localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch {
      /* ignore */
    }
    if (remember && password && typeof window !== 'undefined' && 'PasswordCredential' in window) {
      try {
        // @ts-expect-error — Credential Management API (Chromium 계열)
        const cred = new window.PasswordCredential({ id: loginEmail, password, name: loginEmail });
        await navigator.credentials.store(cred);
      } catch {
        /* 미지원/거부 무시 — autoComplete 속성으로도 브라우저 저장 프롬프트가 뜬다 */
      }
    }
  }

  // 통합 로그인 — 하나의 버튼이 SSO와 이메일/비밀번호를 모두 처리한다.
  //  1) 이메일 도메인으로 등록된 SSO(SAML) IdP가 있으면 그쪽으로 이동
  //  2) SSO가 없으면 비밀번호 로그인으로 자동 폴백
  /**
   * 로그인 제출.
   *
   * 폼에 `method="post"`가 붙어 있는 이유를 여기 적어 둔다. 이 폼은 onSubmit으로만
   * 동작하는 클라이언트 폼이라, **하이드레이션이 끝나기 전**이나 JS가 실패한 상황에서
   * 제출하면 브라우저가 기본 동작을 한다. 그 기본값이 GET이라 입력값이 주소창에 붙는다 —
   * `/login?email=…&password=…` 가 되고, 그 주소는 브라우저 기록·Referer 헤더·프록시
   * 로그에 남는다. (자동 QA가 하이드레이션 전에 눌러서 실제로 이 상태를 재현했다.)
   *
   * method="post"면 같은 상황에서도 값이 본문으로 가고 주소에는 남지 않는다.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const email = ((formData.get('email') as string) ?? '').trim();
    const password = (formData.get('password') as string) ?? '';

    // 이메일 형식 검증 (SSO·비밀번호 공통)
    const emailCheck = emailSchema.safeParse(email);
    if (!emailCheck.success) {
      setErrors({ email: [emailCheck.error.issues[0].message] });
      setPending(false);
      return;
    }

    // 1) 회사 도메인 SSO 우선 시도 — 등록된 IdP가 있으면 IdP 로그인 페이지로 이동
    const domain = email.split('@')[1]?.toLowerCase() ?? '';
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      try {
        const { data, error } = await supabase.auth.signInWithSSO({
          domain,
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (!error && data?.url) {
          await persistCredential(email); // 아이디 저장 (SSO는 비밀번호 없음)
          window.location.href = data.url; // 전환 — pending 유지
          return;
        }
      } catch {
        /* SSO 미등록/오류 → 아래 비밀번호 로그인으로 폴백 */
      }
    }

    // 2) 비밀번호 로그인
    if (!password) {
      setErrors({ password: ['비밀번호를 입력해 주세요. (회사 SSO 계정이라면 관리자에게 문의)'] });
      setPending(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrors({ form: [mapAuthError(error)] });
        setPending(false);
        return;
      }
      await persistCredential(email, password);
      // IP 보안 — 로그인 위치/기기 기록 및 새 IP 감지 (실패해도 로그인은 진행)
      try {
        await fetch('/api/security/login-event', { method: 'POST' });
      } catch {
        /* ignore */
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setErrors({ form: ['로그인 중 예상치 못한 오류가 발생했습니다.'] });
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {oauthError && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{oauthError}</p>
      )}

      <form onSubmit={handleSubmit} method="post" className="space-y-5">
        <div>
          <label htmlFor="email" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">
            EMAIL
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username email webauthn"
            required
            value={email}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-3 text-sm text-fg placeholder:text-fg-quiet focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25"
          />
          {errors.email && <p className="mt-1.5 text-xs text-rose-600">{errors.email[0]}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block font-mono text-xs text-fg-secondary tracking-wider">
              PASSWORD
            </label>
            <Link href="/forgot-password" className="-my-3.5 inline-block py-3.5 text-xs text-fg-muted transition-colors hover:text-signal">
              비밀번호를 잊으셨나요?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-3 pr-16 text-sm text-fg placeholder:text-fg-quiet focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25"
            />
            {/* 비밀번호 보기 — 글자만 있는 24×16 버튼이라 누르기 어려웠다.
                입력칸 안이라 크기를 키우면 글자를 가리므로 좌우·상하 여백으로 영역을 넓힌다. */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-[var(--radius-control)] px-3 py-3 text-xs font-medium text-fg-muted transition-colors hover:bg-paper hover:text-fg"
            >
              {showPassword ? '숨기기' : '보기'}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-rose-600">{errors.password[0]}</p>}
        </div>

        {/* 아이디 저장 — 체크 시 브라우저에 이메일 저장(+ 지원 시 자격증명/패스키) */}
        <label className="flex cursor-pointer select-none items-center gap-2 py-2.5 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRememberInput(e.target.checked)}
            className="h-4 w-4 rounded border-ink/30 text-signal accent-[#4531d9] focus:ring-signal/40"
          />
          아이디 저장
        </label>

        {errors.form && (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
            {errors.form[0]}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-signal py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? '확인 중…' : '로그인'}
        </button>

        <p className="text-center text-[11px] text-fg-quiet">
          회사 SSO 계정은 회사 이메일만 입력하고 로그인하면 자동으로 연결됩니다.
        </p>
      </form>

      <OAuthButtons />
    </div>
  );
}
