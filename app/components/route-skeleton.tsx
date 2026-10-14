// 라우트 전환용 공용 스켈레톤 — loading.tsx는 Suspense fallback이라
// 세션 조회가 필요한 실제 Nav 대신 같은 높이의 정적 크롬 바를 그린다.
const WIDTHS = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
} as const;

export default function RouteSkeleton({
  width = '5xl',
  rows = 6,
}: {
  width?: keyof typeof WIDTHS;
  rows?: number;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-paper text-fg">
      <div className="h-16 bg-surface border-b border-hairline" />
      <main className={`flex-grow ${WIDTHS[width]} w-full mx-auto px-6 sm:px-8 py-12`}>
        <div className="animate-pulse">
          <div className="h-3 w-24 rounded bg-ink/10" />
          <div className="mt-3 h-8 w-56 rounded bg-ink/10" />
          <div className="mt-8 rounded-[var(--radius-panel)] border border-hairline bg-surface divide-y divide-hairline">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-5">
                <div className="h-5 w-5 rounded-full bg-ink/10" />
                <div className="h-4 rounded bg-ink/10" style={{ width: `${45 + ((i * 13) % 30)}%` }} />
                <div className="ml-auto h-4 w-16 rounded bg-ink/10" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
