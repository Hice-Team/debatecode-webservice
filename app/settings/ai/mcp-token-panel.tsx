'use client';

// 로컬 연동 — debateBridge · debateNetwork(MCP) · 파일시스템 동기화.
//
// 셋 다 아직 열지 않았다. "준비중"만 적어 두면 이용자는 무엇을 기다리는지 모르고,
// 되면 알려 주겠다는 말도 없어서 다시 들어와 확인해야 한다.
// 그래서 각각이 **무엇을 할 것인지**와 **지금 대신 쓸 수 있는 것**을 함께 적는다.
//
// 기능을 켤 때는 아래 READY 플래그와 generateMcpToken/revokeMcpToken을 되살린다.

interface Props {
  prefix: string | null;
  createdAt: string | null;
}

interface Feature {
  id: string;
  title: string;
  what: string;
  instead: string;
  ready: boolean;
}

const FEATURES: Feature[] = [
  {
    id: 'bridge',
    title: '로컬 LLM 엔드포인트',
    what: '내 컴퓨터에서 도는 모델(Ollama · LM Studio 등)을 면접관과 debateAI에 연결합니다. 대화가 바깥으로 나가지 않습니다.',
    instead: '지금은 기본 제공 모델을 쓰거나, AI 설정에서 본인 API 키를 등록해 쓸 수 있습니다.',
    ready: false,
  },
  {
    id: 'mcp',
    title: 'debateNetwork (MCP)',
    what: '에디터나 다른 도구에서 debateCode의 문제와 풀이를 직접 읽고 씁니다. 개인 액세스 토큰으로 인증합니다.',
    instead: '문제 목록은 웹에서 그대로 볼 수 있고, 코드는 워크스페이스에서 내려받을 수 있습니다.',
    ready: false,
  },
  {
    id: 'fs',
    title: '파일시스템 동기화',
    what: '풀이 코드를 내 폴더와 양방향으로 맞춥니다. 평소 쓰는 에디터로 풀고 결과만 여기서 채점합니다.',
    instead: '지금은 워크스페이스가 브라우저에 자동 저장하며, 문제별로 코드와 메모가 남습니다.',
    ready: false,
  },
];

export default function McpTokenPanel(_props: Props) {
  return (
    <div>
      <div className="rounded-[var(--radius-panel)] border border-hairline bg-paper px-5 py-4">
        <p className="text-sm leading-relaxed text-fg-secondary">
          로컬 연동은 아직 열지 않았습니다. 열리면 설정 화면과 공지로 알려 드립니다.{' '}
          <strong className="text-fg">AI를 연결하지 않아도</strong> 채점 시스템과 내장 면접관은 그대로 쓸 수
          있습니다.
        </p>
      </div>

      <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
        {FEATURES.map((f) => (
          <li key={f.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">{f.title}</h3>
              <span
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                  f.ready
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-hairline bg-paper text-fg-muted'
                }`}
              >
                {f.ready ? '사용 가능' : '준비 중'}
              </span>
            </div>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-secondary">{f.what}</p>
            <p className="mt-1.5 max-w-prose text-[12px] leading-relaxed text-fg-muted">{f.instead}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
