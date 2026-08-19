import { notFound } from 'next/navigation';
import Nav from '@/app/components/nav';
import AutoHideHeader from './auto-hide-header';
import EditorUnavailable from '@/app/components/editor-unavailable';
import TabletNotice from '@/app/components/tablet-notice';
import { prisma } from '@/app/lib/prisma';
import { canUseEditor, getDeviceClass } from '@/app/lib/device';
import { getSessionOptional } from '@/app/lib/dal';
import { isBuiltinLive } from '@/app/lib/ai/builtin';
import { DEFAULT_CODE_MODEL_ID } from '@/app/lib/ai/debateai-models';
import type { StarterCodes } from '@/app/lib/types';
import Workspace from './workspace';
import { readEntrySource, type ProblemEntryContext } from './entry-context';

export default async function ProblemPage({ params, searchParams }: PageProps<'/problems/[id]'>) {
  // 스마트폰은 에디터를 띄우기 전에 되돌린다 — 무거운 번들을 내려받게 두지 않는다
  const device = await getDeviceClass();
  if (!canUseEditor(device)) return <EditorUnavailable />;

  const { id } = await params;
  const query = await searchParams;
  const problemId = parseInt(id, 10);
  if (Number.isNaN(problemId)) notFound();

  const [problem, session] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: problemId },
      include: { testCases: { orderBy: { order: 'asc' } } },
    }),
    getSessionOptional(),
  ]);
  if (!problem) notFound();

  // debateAI 모델 접근 조건 — 어떤 티어를 고를 수 있는지 화면이 미리 알아야
  // 못 고르는 모델을 눌러 보고 실패하는 일이 없다. 키 자체는 내려보내지 않는다.
  const aiRow = session
    ? await prisma.user.findUnique({
        where: { id: session.userId },
        select: { role: true, aiApiKey: true, aiBaseUrl: true, aiCodeModel: true },
      })
    : null;
  const aiAccess = {
    hasOwnKey: !!aiRow?.aiApiKey,
    hasLocalEndpoint: !!aiRow?.aiBaseUrl,
  };

  // 진입 경로 — 세트에서 왔으면 다음 문제까지 미리 계산해 CTA에 쓴다
  const entrySource = readEntrySource(query);
  let entry: ProblemEntryContext = { source: 'SINGLE', returnPath: '/problems' };
  if (entrySource.source === 'SET' && entrySource.setSlug) {
    const set = await prisma.problemSet.findUnique({
      where: { slug: entrySource.setSlug },
      select: {
        slug: true,
        title: true,
        // 실전 모의고사(mock)만 풀이 조건을 입장 전에 확정한다 — requiresSetup 참조
        kind: true,
        items: { orderBy: { order: 'asc' }, select: { problemId: true } },
      },
    });
    if (set) {
      const index = set.items.findIndex((item) => item.problemId === problemId);
      entry = {
        source: 'SET',
        setSlug: set.slug,
        setTitle: set.title,
        setKind: set.kind,
        problemIndex: index >= 0 ? index : undefined,
        totalInSet: set.items.length,
        nextProblemId: index >= 0 && index + 1 < set.items.length ? set.items[index + 1].problemId : null,
        returnPath: `/contests/${set.slug}`,
      };
    }
  }

  // 클라이언트 채점용 페이로드 (히든 케이스는 args/expected는 전달하되 내용 미표시)
  // 알려진 한계: 클라이언트 채점 구조상 케이스가 노출됨 — README 참조
  const workspaceProblem = {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    category: problem.category,
    description: problem.description,
    timeLimitMs: problem.timeLimitMs,
    tags: problem.tags as string[],
    starterCodes: problem.starterCodes as unknown as StarterCodes,
    cases: problem.testCases.map((tc) => ({
      id: tc.id,
      args: tc.input as unknown[],
      expected: tc.expected,
      isHidden: tc.isHidden,
    })),
  };

  return (
    <div className="flex flex-col h-screen bg-ink text-white overflow-hidden">
      {/* 다크 워크스페이스와 톤이 다른 밝은 헤더는 이 페이지에서만 자동 숨김(핀 고정 가능) */}
      <AutoHideHeader>
        <Nav />
      </AutoHideHeader>
      {/* 태블릿은 막지 않되, 데스크톱과 배치가 다르다는 것만 한 번 알린다 */}
      {device === 'tablet' && <TabletNotice />}
      <Workspace
        problem={workspaceProblem}
        isLoggedIn={!!session}
        builtinLive={isBuiltinLive()}
        entry={entry}
        defaultChatModel={aiRow?.aiCodeModel ?? DEFAULT_CODE_MODEL_ID}
        aiAccess={aiAccess}
      />
    </div>
  );
}
