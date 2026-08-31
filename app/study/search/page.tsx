import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Nav from '@/app/components/nav';
import { getSessionOptional } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { ensureSession, listFolders, listSessions, loadSession } from '@/app/lib/actions/ai-search';
import { hasModelCatalogAccess } from '@/app/lib/ai/search-answerer';
import { DEFAULT_SEARCH_MODEL_ID, isSearchModelId } from '@/app/lib/ai/search-models';
import { asEffort } from '@/app/lib/ai/effort';
import Conversation, { type ConversationMessage } from './conversation';
import SearchShell from './search-shell';

export const metadata: Metadata = { title: 'AI Search' };

// AI Search 대화 화면 — 세션의 메시지를 복원하고 이어서 질문한다.
// q 파라미터로 들어오면(검색바에서 바로 제출) 첫 질문으로 자동 전송한다.
//
// `?session=`이 없으면 **새 대화**로 연다. 예전에는 가장 최근 세션을 이어받아서
// 이용자 한 명에 대화 하나만 있는 것처럼 굴었다. 지난 대화는 왼쪽 사이드바에서 고른다.
export default async function AiSearchPage({ searchParams }: PageProps<'/study/search'>) {
  const { q, session: sessionParam, model: modelParam, effort: effortParam } = await searchParams;
  const initialQuestion = typeof q === 'string' ? q.trim() : '';
  const auth = await getSessionOptional();

  // AI Search는 세션(대화 저장)이 전제라 비로그인 상태로는 아무것도 할 수 없다.
  // 안내 화면을 띄우고 한 번 더 누르게 하는 대신 곧바로 로그인으로 보낸다.
  if (!auth) redirect('/login');

  // 지정된 세션이 있으면 그것을, 없으면 새 대화를 연다
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
    // 내 평가만 싣는다 — loadSession이 현재 사용자 세션만 돌려주므로 feedback도 한 건 이하다
    feedback: m.feedback[0]
      ? {
          rating: m.feedback[0].rating as 'up' | 'down',
          reasons: (m.feedback[0].reasons as unknown as string[]) ?? [],
          comment: m.feedback[0].comment,
        }
      : null,
  }));

  const importedFrom = (restored?.importedFrom as { fileName?: string; messageCount?: number } | null) ?? null;
  const branchedFrom =
    (restored?.branchedFrom as { sessionId?: string; title?: string | null } | null) ?? null;

  // 인사말에 쓸 이름 — 없으면 이름 없이 인사한다(지어내지 않는다)
  const viewer = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { name: true },
  });

  // 사이드바 — 대화 목록과 폴더. 지금 보고 있는 대화를 표시해 준다.
  const [rows, folderRows] = await Promise.all([listSessions(), listFolders()]);
  const sessions = rows.map((session) => ({
    id: session.id,
    title: session.title,
    folderId: session.folderId,
    updatedAt: session.updatedAt.toISOString(),
    messageCount: session._count.messages,
  }));
  const folders = folderRows.map((folder) => ({
    id: folder.id,
    name: folder.name,
    sessionCount: folder._count.sessions,
  }));

  return (
    // 화면 높이를 넘기지 않는 셸 — [네비] / [기록 | 대화]
    // 대화 열 안에서 위는 스크롤되고 아래(입력창)는 붙어 있다. 그래서 입력창이 화면에
    // 고정될 필요도, 사이드바 폭만큼 비켜 줄 필요도 없다.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-paper text-fg">
      <Nav />
      <div className="flex min-h-0 flex-1">
        <SearchShell sessions={sessions} folders={folders} activeId={sessionId}>
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
            branchedFrom={branchedFrom}
            liveModel={hasModelCatalogAccess()}
            userName={viewer?.name ?? null}
          />
        </SearchShell>
      </div>
    </div>
  );
}
