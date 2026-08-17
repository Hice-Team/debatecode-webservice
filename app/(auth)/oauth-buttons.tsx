'use client';

// 소셜 로그인 원형 버튼 — 각 사 공식 브랜드 가이드 기반.
// 구글 / 카카오 / 깃허브 / 디스코드 / 링크드인 5종을 고정으로 항상 노출한다.
// 이메일 로그인 아래 섹션에 배치된다 (OR 구분선이 위).
import { signInWithOAuth, type OAuthProvider } from '@/app/lib/actions/auth';

function GoogleSymbol() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29A7.19 7.19 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.97 11.97 0 0 0 0 10.76l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

function NaverSymbol() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#ffffff" aria-hidden>
      <path d="M16.27 12.85 7.38 0H0v24h7.73V11.15L16.62 24H24V0h-7.73v12.85z" transform="scale(0.7) translate(5,5)" />
    </svg>
  );
}

function KakaoSymbol() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#191919" aria-hidden>
      <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.65l-.95 3.53c-.08.31.27.56.54.38l4.19-2.79c.51.05 1.03.08 1.56.08 5.52 0 10-3.54 10-7.85S17.52 3 12 3z" />
    </svg>
  );
}

function GitHubSymbol() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#ffffff" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.61-.01 2.9-.01 3.29 0 .32.21.7.82.58A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function DiscordSymbol() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#ffffff" aria-hidden>
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.6 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04c-1.7.3-3.35.8-4.88 1.52a.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06c0 .02.01.04.03.05a19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.12c.13-.1.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08 0c.12.1.25.2.37.3a.08.08 0 0 1 0 .12 12.3 12.3 0 0 1-1.88.9.08.08 0 0 0-.04.1c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.02 19.84 19.84 0 0 0 6.03-3.02.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.22 0 2.18 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42z" />
    </svg>
  );
}

interface ProviderDef {
  key: OAuthProvider;
  label: string;
  className: string;
  symbol: React.ReactNode;
}

// 고정 노출 5종 — 확장/더보기 없음. 순서: 구글 · 네이버 · 카카오 · 깃허브 · 디스코드
const PROVIDERS: ProviderDef[] = [
  { key: 'google', label: '구글로 계속하기', className: 'bg-white border border-[#dadce0] hover:bg-gray-50', symbol: <GoogleSymbol /> },
  { key: 'naver', label: '네이버로 계속하기', className: 'bg-[#03C75A] hover:brightness-95', symbol: <NaverSymbol /> },
  { key: 'kakao', label: '카카오로 계속하기', className: 'bg-[#FEE500] hover:brightness-95', symbol: <KakaoSymbol /> },
  { key: 'github', label: '깃허브로 계속하기', className: 'bg-[#181717] hover:bg-[#2b2a2a]', symbol: <GitHubSymbol /> },
  { key: 'discord', label: '디스코드로 계속하기', className: 'bg-[#5865F2] hover:brightness-110', symbol: <DiscordSymbol /> },
];

// action: 프로바이더를 받아 OAuth 흐름을 시작하는 서버 액션 — 기본은 로그인, 가입 위저드는
// 동의 쿠키를 심는 signupWithOAuth를 바인딩해 넘긴다.
export default function OAuthButtons({
  action,
  heading = '간편 로그인',
}: {
  action?: (provider: OAuthProvider) => Promise<void>;
  heading?: string;
}) {
  const startOAuth = action ?? signInWithOAuth;

  return (
    <div>
      <div className="flex items-center gap-3 pb-4">
        <span className="h-px flex-1 bg-ink/10" />
        <span className="font-mono text-[11px] text-ink-soft/40">OR</span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>
      <p className="text-center font-mono text-[11px] text-ink-soft/40 tracking-wider mb-3">{heading}</p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {PROVIDERS.map((p) => (
          <form key={p.key} action={startOAuth.bind(null, p.key)}>
            <button
              type="submit"
              aria-label={p.label}
              title={p.label}
              className={`flex h-12 w-12 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-105 active:scale-95 ${p.className}`}
            >
              {p.symbol}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
