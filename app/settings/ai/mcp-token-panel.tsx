'use client';

// debateNetwork(MCP)·debateBridge 연동 토큰 패널.
// 발급 시 평문 토큰을 1회만 노출하고, 서버에는 해시만 저장된다.

interface Props {
  prefix: string | null;
  createdAt: string | null;
}

// 기능을 다시 켤 때 prefix·createdAt과 generateMcpToken/revokeMcpToken을 되살린다.
export default function McpTokenPanel(_props: Props) {
  // 현재 로컬 연동 기능은 준비중입니다. UI에서 기능을 숨기고 안내만 표시합니다.
  return (
    <div className="dc-card rounded-xl p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">MCP · 로컬 연동</h2>
          <p className="mt-1 text-sm text-fg-secondary">로컬 연동 기능은 현재 준비 중입니다. 곧 베타로 공개할 예정입니다.</p>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium bg-paper text-fg-muted">준비중</span>
      </div>

      <div className="mt-6 rounded-xl border border-hairline bg-paper/60 p-6 text-sm text-fg-muted">
        <p>로컬 LLm(예: debateBridge, Ollama, LM Studio) 연동은 다음 버전에서 제공됩니다.</p>
        <p className="mt-3">필요하신 경우 데모나 우선 제공 요청을 남겨 주세요. (관리자 연락 필요)</p>
      </div>
    </div>
  );
}
