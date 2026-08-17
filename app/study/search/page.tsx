import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/app/components/nav';
import { getSessionOptional } from '@/app/lib/dal';
import { ensureSession, loadSession } from '@/app/lib/actions/ai-search';
import { hasModelCatalogAccess } from '@/app/lib/ai/search-answerer';
import { DEFAULT_SEARCH_MODEL_ID, isSearchModelId } from '@/app/lib/ai/search-models';
import { asEffort } from '@/app/lib/ai/effort';
import Conversation, { type ConversationMessage } from './conversation';

export const metadata: Metadata = { title: 'AI Search' };

// AI Search 대화 화면 — 세션의 메시지를 복원하고 이어서 질문한다.
// q 파라미터로 들어오면(검색바에서 바로 제출) 첫 질문으로 자동 전송한다.
export default async function AiSearchPage({ searchParams }: PageProps<'/study/search'>) {
  const { q, session: sessionParam, model: modelParam, effort: effortParam } = await searchParams;
  const initialQuestion = typeof q === 'string' ? q.trim() : '';
  const auth = await getSessionOptional();

  // AI Search는 세션(대화 저장)이 전제라 비로그인 상태로는 아무것도 할 수 없다.
  // 안내 화면을 띄우고 한 번 더 누르게 하는 대신 곧바로 로그인으로 보낸다.
  if (!auth) redirect('/login');

  // 지정된 세션이 있으면 그것을, 없으면 활성 세션을 쓴다
  const requestedId = typeof sessionParam === 'string' ? sessionParam : '';
  const loaded = requestedId ? await loadSession(requestedId) : null;
  const sessionId = loaded?.id ?? (await ensureSession()).sessionId;
  const restored = loaded ?? (await loadSession(sessionId));

  const messages: ConversationMessage[] = (restored?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    attachments: (m.attachments as unknown as ConversationMessage['attachments']) ?? [],
    model: m.model,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
    tokensEstimated: m.tokensEstimated,
    effort: m.effort,
  }));

  const importedFrom = (restored?.importedFrom as { fileName?: string; messageCount?: number } | null) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink-soft">
      <Nav />
      {/* key — 세션이 바뀌면 대화 화면을 통째로 새로 마운트해 이전 세션 상태가 남지 않게 한다 */}
      <Conversation
        key={sessionId}
        sessionId={sessionId}
        initialMessages={messages}
        initialQuestion={initialQuestion}
        initialModel={
          isSearchModelId(modelParam) ? modelParam : (restored?.model ?? DEFAULT_SEARCH_MODEL_ID)
        }
        initialEffort={asEffort(effortParam ?? restored?.effort)}
        importedFrom={importedFrom}
        liveModel={hasModelCatalogAccess()}
      />
    </div>
  );
}
