// debateAI 입력창 위의 추천 프롬프트.
//
// 두 축으로 달라진다.
//   문제별  카테고리·태그·난이도, 그리고 "지금 코드가 어떤 상태인가"
//   사용자별 대화를 시작했는지, 실행에서 몇 개나 틀렸는지, 어떤 모드/난이도인지
// 즉 같은 문제라도 코드를 아직 안 썼을 때와 절반쯤 틀렸을 때 다른 목록이 나온다.
//
// 서버를 부르지 않는다 — 화면이 이미 아는 정보만으로 즉시 만든다.
import type { ScaffoldLevel } from '@/app/lib/scaffold';

export interface PromptContext {
  category: string;
  tags: string[];
  difficulty: number;
  /** 에디터에 실제로 쓴 코드가 있는가 (주석·스타터 제외) */
  hasCode: boolean;
  /** 마지막 실행에서 실패한 케이스 수 — 아직 안 돌렸으면 null */
  failedCount: number | null;
  level: ScaffoldLevel;
  /** 대화를 이미 시작했는가 — 첫 질문과 이어지는 질문은 결이 다르다 */
  started: boolean;
  mode: 'signature' | 'debate' | 'refactor';
}

/** 카테고리별로 물어볼 만한 것 — 문제 유형이 곧 막히는 지점이다. */
const BY_CATEGORY: Record<string, string[]> = {
  DP: ['점화식을 어떻게 세우면 좋을까요?', '메모이제이션과 타뷸레이션 중 뭐가 더 맞을까요?'],
  그래프: ['BFS와 DFS 중 어느 쪽이 맞을까요?', '방문 처리를 어디서 해야 하나요?'],
  그리디: ['이 문제에서 그리디가 최적해를 보장하나요?', '어떤 기준으로 정렬해야 할까요?'],
  정렬: ['정렬 기준을 어떻게 잡아야 하나요?', '안정 정렬이 필요한 문제인가요?'],
  해시: ['해시맵의 키를 무엇으로 잡아야 하나요?', '충돌이나 중복은 어떻게 처리하나요?'],
  문자열: ['문자열을 어떤 단위로 잘라야 하나요?', '정규식으로 푸는 게 나을까요?'],
  구현: ['처리 순서를 어떻게 나누면 깔끔할까요?', '놓치기 쉬운 조건이 있을까요?'],
  탐색: ['이분탐색의 경계 조건을 어떻게 잡나요?', '탐색 범위를 무엇으로 두어야 하나요?'],
  스택: ['스택에 무엇을 넣어야 하나요?', '언제 pop 해야 하는지 판단이 어렵습니다.'],
  큐: ['큐에 넣을 상태를 어떻게 정의하나요?', '덱을 쓰면 더 나을까요?'],
};

const GENERIC_FIRST = [
  '이 문제를 더 쉽게 다시 설명해 주세요.',
  '어떤 자료구조부터 떠올려야 하나요?',
  '입력 예시를 하나 따라가며 설명해 주세요.',
];

const GENERIC_NEXT = [
  '제 접근이 맞는 방향인지 봐 주세요.',
  '시간 복잡도를 줄일 여지가 있을까요?',
  '놓친 엣지 케이스가 있을까요?',
];

const REFACTOR = [
  '이 코드에서 어느 부분을 먼저 살펴봐야 하나요?',
  '지금 구조에서 성능 문제가 생길 지점은 어디인가요?',
  '이 코드가 어떤 입력에서 깨질 수 있나요?',
];

/** 앞에서부터 채우되 중복은 버리고, 최대 개수까지만 남긴다. */
function take(pools: string[][], max: number): string[] {
  const out: string[] = [];
  for (const pool of pools) {
    for (const item of pool) {
      if (out.length >= max) return out;
      if (!out.includes(item)) out.push(item);
    }
  }
  return out;
}

export function buildPromptSuggestions(ctx: PromptContext, max = 8): string[] {
  const pools: string[][] = [];

  // 1) 지금 상태에서 가장 급한 것 — 실패한 케이스가 있으면 그것부터
  if (ctx.failedCount != null && ctx.failedCount > 0) {
    pools.push([
      `테스트 ${ctx.failedCount}개가 실패했습니다. 어디를 의심해야 하나요?`,
      '제 코드가 어떤 입력에서 틀리는지 짚어 주세요.',
    ]);
  }

  // 2) 모드 고유 질문
  if (ctx.mode === 'refactor') pools.push(REFACTOR);

  // 3) 코드를 아직 안 썼으면 시작을, 썼으면 점검을 권한다
  if (!ctx.hasCode) {
    pools.push(['어디서부터 시작해야 할지 모르겠어요.', '함수의 입력과 출력을 정리해 주세요.']);
  } else {
    pools.push(['지금까지 쓴 코드를 검토해 주세요.']);
  }

  // 4) 문제 유형별
  const byCategory = BY_CATEGORY[ctx.category];
  if (byCategory) pools.push(byCategory);
  const byTag = ctx.tags.map((tag) => `${tag} 개념을 예시로 설명해 주세요.`);
  if (byTag.length > 0) pools.push(byTag);

  // 5) 어려운 문제면 설계부터 짚어 주는 질문을 얹는다
  if (ctx.difficulty >= 3) pools.push(['이 문제의 핵심 아이디어만 한 줄로 알려 주세요.']);

  // 6) 범용 — 대화 시작 전후로 결을 바꾼다
  pools.push(ctx.started ? GENERIC_NEXT : GENERIC_FIRST);

  return take(pools, max);
}
