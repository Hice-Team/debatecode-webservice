// 문제 워크스페이스 로딩 스켈레톤 — DB 조회 동안 빈 화면 대신 구조를 먼저 그린다
export default function ProblemLoading() {
  return (
    <div className="flex flex-col h-screen bg-ink text-white overflow-hidden">
      <div className="h-16 border-b border-white/10 bg-ink/95" />
      <div className="flex-grow flex flex-col lg:flex-row min-h-0 animate-pulse">
        <div className="lg:w-[44%] border-r border-white/10 p-6 space-y-4">
          <div className="h-5 w-2/3 bg-white/10 rounded" />
          <div className="h-3 w-full bg-white/5 rounded" />
          <div className="h-3 w-5/6 bg-white/5 rounded" />
          <div className="h-3 w-4/6 bg-white/5 rounded" />
          <div className="h-24 w-full bg-white/5 rounded-lg mt-6" />
        </div>
        <div className="flex-grow flex flex-col">
          <div className="h-11 border-b border-white/10 bg-white/[0.02]" />
          <div className="flex-grow flex items-center justify-center font-mono text-xs text-white/30">
            워크스페이스 준비 중…
          </div>
          <div className="h-48 border-t border-white/10 bg-ink-soft/60" />
        </div>
      </div>
    </div>
  );
}
