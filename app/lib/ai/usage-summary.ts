// Free Tier 사용량을 "어느 셀렉터에서 고른 모델인가"로 나눠 정리한다.
//
// 총량 막대 하나만으로는 한도를 왜 다 썼는지 알 수 없다. 모델을 고르는 자리는 두 곳
// (AI Search의 모델 선택기, debateAI 탭·면접의 모델 선택기)이므로 사용량도 그 축으로 묶는다.
// 지금 선택돼 있는 모델은 사용 기록이 없어도 목록에 남겨 둔다 — "지금 무엇을 쓰고 있는지"가
// 사용량만큼이나 알고 싶은 정보다.
import { prisma } from '../prisma';
import { getFreeAiQuota } from './free-ai';
import { DEBATEAI_MODELS, DEFAULT_CODE_MODEL_ID } from './debateai-models';
import { SEARCH_MODELS } from './search-models';
import { AI_USAGE_POLICY, peekAiUsage } from './usage-limits';

export type UsageSurface = 'debateai' | 'ai-search' | 'other';

export interface ModelUsageRow {
  id: string;
  label: string;
  surface: UsageSurface;
  used: number;
  selected: boolean;
}

/** 리팩토링모드처럼 이용자가 모델을 고르지 않는 자리 — 사용량 목록에서는 한 줄로 묶는다 */
const IMPLICIT_LABELS: Record<string, string> = {
  'builtin-refactor': '리팩토링모드 (내장 모델)',
};

function labelFor(id: string): string {
  return (
    DEBATEAI_MODELS.find((m) => m.id === id)?.label ??
    SEARCH_MODELS.find((m) => m.id === id)?.label ??
    IMPLICIT_LABELS[id] ??
    id
  );
}

/** 그 모델을 어느 화면에서 고르는가 — 두 카탈로그에 다 있으면 고른 자리를 우선한다 */
function surfaceFor(id: string, searchSelected: string | null): UsageSurface {
  if (id === searchSelected) return 'ai-search';
  if (DEBATEAI_MODELS.some((m) => m.id === id)) return 'debateai';
  if (SEARCH_MODELS.some((m) => m.id === id)) return 'ai-search';
  return 'other';
}

/** 회수 한도 현황 — 이용자가 실제로 세면서 쓸 수 있는 값. */
export interface AllowanceSummary {
  aiSearch: { used: number; limit: number; remaining: number; resetAt: Date | null };
  /** debateAI는 문제별로 따로 세므로 총량이 없다. 정책만 알려 준다. */
  debateAiPerProblem: number;
  /** 개인 키·로컬 모델을 등록해 두어 한도가 걸리지 않는 상태인가 */
  unlimited: boolean;
}

export interface FreeUsageSummary {
  /** 누적 토큰 — 한도가 아니라 **내역**이다. 차단 기준은 allowance 쪽이다. */
  used: number;
  limit: number;
  resetAt: Date | null;
  exhausted: boolean;
  models: ModelUsageRow[];
  allowance: AllowanceSummary;
}

export async function getFreeUsageSummary(userId: string): Promise<FreeUsageSummary> {
  const [quota, user, lastSearch, searchUsage] = await Promise.all([
    getFreeAiQuota(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { aiCodeModel: true, aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true },
    }),
    // AI Search는 세션마다 모델을 기억한다 — 가장 최근 세션의 모델이 지금 고른 모델이다
    prisma.aiSession.findFirst({
      where: { userId, model: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { model: true },
    }),
    peekAiUsage(userId, 'ai-search'),
  ]);

  // 개인 키나 로컬 모델을 등록해 두었으면 한도 자체가 걸리지 않는다.
  // 키 원문은 필요 없다 — 등록돼 있는지만 보면 되므로 복호화하지 않는다.
  const unlimited = !!user?.aiApiKey || !!user?.aiBaseUrl;

  const debateAiSelected = user?.aiCodeModel || DEFAULT_CODE_MODEL_ID;
  const searchSelected = lastSearch?.model ?? null;

  // 사용 기록이 있는 모델 + 지금 선택된 두 모델을 합집합으로 모은다
  const ids = new Set<string>(Object.keys(quota.byModel));
  ids.add(debateAiSelected);
  if (searchSelected) ids.add(searchSelected);

  const models: ModelUsageRow[] = [...ids].map((id) => ({
    id,
    label: labelFor(id),
    surface: surfaceFor(id, searchSelected),
    used: quota.byModel[id] ?? 0,
    selected: id === debateAiSelected || id === searchSelected,
  }));

  // 많이 쓴 순 — 같은 양이면 선택된 모델을 위로
  models.sort((a, b) => b.used - a.used || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label));

  return {
    used: quota.used,
    limit: quota.limit,
    resetAt: quota.resetAt,
    exhausted: quota.exhausted,
    models,
    allowance: {
      aiSearch: {
        used: searchUsage.used,
        limit: searchUsage.limit,
        remaining: searchUsage.remaining,
        resetAt: searchUsage.resetAt,
      },
      debateAiPerProblem: AI_USAGE_POLICY.debateai.limit,
      unlimited,
    },
  };
}
