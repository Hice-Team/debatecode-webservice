'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { mapAuthError } from '@/app/lib/auth-errors';
import OAuthButtons from '../oauth-buttons';
import { z } from 'zod';

import { useLanguage } from '@/app/context/language-context';
import type { Language } from '@/app/lib/i18n';

const emailSchema = z.string().email('올바른 이메일 형식이 아닙니다.');

const SAVED_EMAIL_KEY = 'dc_saved_email';

// 저장된 아이디는 브라우저에만 있다 — 서버 렌더에는 존재하지 않는다.
//
// 예전에는 effect에서 읽어 setState 했는데, 그러면 첫 렌더가 빈 값으로 한 번 그려진 뒤
// 곧바로 다시 그려진다(입력칸이 깜빡인다). React Compiler도 이 패턴을 막는다.
// useSyncExternalStore는 서버 스냅샷을 따로 받으므로 하이드레이션 불일치 없이 첫 렌더에
// 바로 값을 넣을 수 있다. localStorage는 이 페이지가 떠 있는 동안 밖에서 바뀌지 않으므로
// 구독은 아무것도 하지 않는다.

interface LoginCopy {
  emailInvalid: string;
  passwordRequired: string;
  unexpectedError: string;
  forgotPassword: string;
  show: string;
  hide: string;
  remember: string;
  submit: string;
  pending: string;
  ssoHint: string;
}

const LOGIN_COPY: Record<Language, LoginCopy> = {
  ko: {
    emailInvalid: '올바른 이메일 형식이 아닙니다.',
    passwordRequired: '비밀번호를 입력해 주세요. (회사 SSO 계정이라면 관리자에게 문의)',
    unexpectedError: '로그인 중 예상치 못한 오류가 발생했습니다.',
    forgotPassword: '비밀번호를 잊으셨나요?',
    show: '보기',
    hide: '숨기기',
    remember: '아이디 저장',
    submit: '로그인',
    pending: '확인 중…',
    ssoHint: '회사 SSO 계정은 회사 이메일만 입력하고 로그인하면 자동으로 연결됩니다.',
  },
  en: {
    emailInvalid: 'Please enter a valid email address.',
    passwordRequired: 'Please enter your password.',
    unexpectedError: 'An unexpected error occurred during sign in.',
    forgotPassword: 'Forgot password?',
    show: 'Show',
    hide: 'Hide',
    remember: 'Remember email',
    submit: 'Sign in',
    pending: 'Signing in…',
    ssoHint: 'Enterprise SSO users can simply enter their work email to be redirected.',
  },
  ja: {
    emailInvalid: '有効なメールアドレスを入力してください。',
    passwordRequired: 'パスワードを入力してください。',
    unexpectedError: 'ログイン中に予期せぬエラーが発生しました。',
    forgotPassword: 'パスワードをお忘れですか？',
    show: '表示',
    hide: '非表示',
    remember: 'ログイン情報を記憶',
    submit: 'ログイン',
    pending: '確認中…',
    ssoHint: '企業SSOアカウントは社内メールアドレスを入力するだけで自動連携されます。',
  },
  'zh-CN': {
    emailInvalid: '请输入有效的电子邮箱地址。',
    passwordRequired: '请输入密码。',
    unexpectedError: '登录过程中发生未知错误。',
    forgotPassword: '忘记密码？',
    show: '显示',
    hide: '隐藏',
    remember: '记住邮箱',
    submit: '登录',
    pending: '正在验证…',
    ssoHint: '企业 SSO 账户输入企业邮箱后将自动跳转身份认证。',
  },
  'zh-TW': {
    emailInvalid: '請輸入有效的電子郵件地址。',
    passwordRequired: '請輸入密碼。',
    unexpectedError: '登入過程中發生未知錯誤。',
    forgotPassword: '忘記密碼？',
    show: '顯示',
    hide: '隱藏',
    remember: '記住電子郵件',
    submit: '登入',
    pending: '正在驗證…',
    ssoHint: '企業 SSO 帳戶輸入企業信箱後將自動跳轉驗證。',
  },
};

const noopSubscribe = () => () => {};

function readSavedEmail(): string | null {
  try {
    return localStorage.getItem(SAVED_EMAIL_KEY);
  } catch {
    return null;
  }
}

export default function LoginForm({ oauthError }: { oauthError?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const copy = LOGIN_COPY[language] ?? LOGIN_COPY.ko;

  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const savedEmail = useSyncExternalStore(noopSubscribe, readSavedEmail, () => null);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  const [rememberInput, setRememberInput] = useState<boolean | null>(null);
  const email = emailInput ?? savedEmail ?? '';
  const remember = rememberInput ?? Boolean(savedEmail);

  const [errors, setErrors] = useState<{
    email?: string[];
    password?: string[];
    form?: string[];
  }>({});

  async function persistCredential(loginEmail: string, password?: string) {
    try {
      if (remember) localStorage.setItem(SAVED_EMAIL_KEY, loginEmail);
      else localStorage.removeItem(SAVED_EMAIL_KEY);
    } catch {
      /* ignore */
    }
    if (remember && password && typeof window !== 'undefined' && 'PasswordCredential' in window) {
      try {
        // @ts-expect-error — Credential Management API (Chromium)
        const cred = new window.PasswordCredential({ id: loginEmail, password, name: loginEmail });
        await navigator.credentials.store(cred);
      } catch {
        /* ignore */
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const emailVal = ((formData.get('email') as string) ?? '').trim();
    const password = (formData.get('password') as string) ?? '';

    const emailCheck = z.string().email(copy.emailInvalid).safeParse(emailVal);
    if (!emailCheck.success) {
      setErrors({ email: [emailCheck.error.issues[0].message] });
      setPending(false);
      return;
    }

    const domain = emailVal.split('@')[1]?.toLowerCase() ?? '';
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      try {
        const { data, error } = await supabase.auth.signInWithSSO({
          domain,
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (!error && data?.url) {
          await persistCredential(emailVal);
          window.location.href = data.url;
          return;
        }
      } catch {
        /* fallback to password */
      }
    }

    if (!password) {
      setErrors({ password: [copy.passwordRequired] });
      setPending(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailVal, password });
      if (error) {
        setErrors({ form: [mapAuthError(error)] });
        setPending(false);
        return;
      }
      await persistCredential(emailVal, password);
      try {
        await fetch('/api/security/login-event', { method: 'POST' });
      } catch {
        /* ignore */
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setErrors({ form: [copy.unexpectedError] });
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
              {copy.forgotPassword}
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
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-[var(--radius-control)] px-3 py-3 text-xs font-medium text-fg-muted transition-colors hover:bg-paper hover:text-fg"
            >
              {showPassword ? copy.hide : copy.show}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-rose-600">{errors.password[0]}</p>}
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2 py-2.5 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRememberInput(e.target.checked)}
            className="h-4 w-4 rounded border-fg-quiet text-signal accent-[#4531d9] focus:ring-signal/40"
          />
          {copy.remember}
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
          {pending ? copy.pending : copy.submit}
        </button>

        <p className="text-center text-[11px] text-fg-quiet [word-break:keep-all]">
          {copy.ssoHint}
        </p>
      </form>

      <OAuthButtons />
    </div>
  );
}
