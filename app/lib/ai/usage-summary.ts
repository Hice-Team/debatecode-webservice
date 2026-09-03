// Free Tier 사용량을 모델별로 정리한다.
//
// 총량 막대 하나만으로는 한도를 왜 다 썼는지 알 수 없다. 어느 모델이 얼마나 썼는지까지
// 보여야 "무엇을 줄일지"를 정할 수 있다. 지금 선택돼 있는 모델은 사용 기록이 없어도
// 목록에 남겨 둔다 — "지금 무엇을 쓰고 있는지"가 사용량만큼이나 알고 싶은 정보다.
//
// 예전에는 모델을 고르는 자리가 둘(AI Search · debateAI)이라 표면(surface)으로도 나눴다.
// AI Search가 사라지면서 고르는 자리가 debateAI 하나만 남아 그 축은 걷어냈다.
import { prisma } from '../prisma';
import { getFreeAiQuota } from './free-ai';
import { DEBATEAI_MODELS, DEFAULT_CODE_MODEL_ID } from './debateai-models';
import { AI_USAGE_POLICY } from './usage-limits';

export interface ModelUsageRow {
  id: string;
  label: string;
  used: number;
  selected: boolean;
}

/** 리팩토링모드처럼 이용자가 모델을 고르지 않는 자리 — 사용량 목록에서는 한 줄로 묶는다 */
const IMPLICIT_LABELS: Record<string, string> = {
  'builtin-refactor': '리팩토링모드 (내장 모델)',
};

function labelFor(id: string): string {
  return DEBATEAI_MODELS.find((m) => m.id === id)?.label ?? IMPLICIT_LABELS[id] ?? id;
}

/** 회수 한도 현황 — 이용자가 실제로 세면서 쓸 수 있는 값. */
export interface AllowanceSummary {
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
  const [quota, user] = await Promise.all([
    getFreeAiQuota(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { aiCodeModel: true, aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true },
    }),
  ]);

  // 개인 키나 로컬 모델을 등록해 두었으면 한도 자체가 걸리지 않는다.
  // 키 원문은 필요 없다 — 등록돼 있는지만 보면 되므로 복호화하지 않는다.
  const unlimited = !!user?.aiApiKey || !!user?.aiBaseUrl;
  const selected = user?.aiCodeModel || DEFAULT_CODE_MODEL_ID;

  // 사용 기록이 있는 모델 + 지금 선택된 모델을 합집합으로 모은다
  const ids = new Set<string>(Object.keys(quota.byModel));
  ids.add(selected);

  const models: ModelUsageRow[] = [...ids].map((id) => ({
    id,
    label: labelFor(id),
    used: quota.byModel[id] ?? 0,
    selected: id === selected,
  }));

  // 많이 쓴 순 — 같은 양이면 선택된 모델을 위로
  models.sort(
    (a, b) => b.used - a.used || Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label),
  );

  return {
    used: quota.used,
    limit: quota.limit,
    resetAt: quota.resetAt,
    exhausted: quota.exhausted,
    models,
    allowance: {
      debateAiPerProblem: AI_USAGE_POLICY.debateai.limit,
      unlimited,
    },
  };
}
