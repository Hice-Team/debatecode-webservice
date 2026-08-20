import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/app/components/page-shell';
import { unsubscribeByToken } from '@/app/lib/marketing';

export const metadata: Metadata = { title: '수신거부', robots: { index: false, follow: false } };

// 수신거부 — 링크 한 번으로 끝난다. 로그인도, 확인 절차도 요구하지 않는다.
// 토큰이 곧 본인 확인이며, 해지를 어렵게 만드는 것은 스팸 신고로 돌아온다.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const result = await unsubscribeByToken(typeof token === 'string' ? token : '');

  return (
    <PageShell width="3xl">
      <div className="mx-auto max-w-md py-16 text-center">
        {result.ok ? (
          <>
            <p className="text-4xl">✉️</p>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">수신거부가 완료되었습니다</h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
              {result.email && (
                <>
                  <span data-no-translate className="font-mono">{result.email}</span> 주소로는{' '}
                </>
              )}
              더 이상 홍보성 이메일을 보내지 않습니다. 서비스 이용에는 영향이 없습니다.
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl">🔗</p>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">처리할 수 없는 링크입니다</h1>
            <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
              링크가 만료되었거나 이미 수신거부된 주소일 수 있습니다. 설정에서도 언제든 변경할 수 있습니다.
            </p>
          </>
        )}
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          홈으로
        </Link>
      </div>
    </PageShell>
  );
}
