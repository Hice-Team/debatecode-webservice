'use server';

// 시즌 · 랭킹 운영 — 콘솔 › 시즌·랭킹에서 부르는 액션들.
//
// 세 가지가 서로 다른 일이라는 점이 중요하다. 한 버튼으로 묶으면 되돌릴 수 없는 실수가 난다.
//
//   시즌 초기화   지금부터 시즌 1로 다시 센다. **순위는 그대로 남는다** —
//                 번호만 다시 매기는 일이며, 이번 시즌 구간이 오늘부터 시작될 뿐이다.
//   랭킹 초기화   이 시각 이전 활동을 집계에서 뺀다. 모두의 순위가 0에서 다시 시작한다.
//   개인 초기화   부정행위가 확인된 계정 하나만 이번 구간 순위에서 제외한다.
//
// 어느 것도 활동 기록(제출·게시글)을 지우지 않는다. 학습 이력이자 신고 처리의 근거이고,
// 지우면 되돌릴 수 없다.
import { revalidatePath } from 'next/cache';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { requirePermission } from '../permissions-server';
import { settingDef } from '../settings';
import { audit } from '../audit';

export interface SeasonActionState {
  ok?: string;
  error?: string;
}

/**
 * 설정 값 하나를 쓴다 — 기본값과 같아지면 행을 지운다.
 * AppSetting 표에는 "기본값에서 벗어난 것"만 남아 있어야 무엇을 손댔는지 한눈에 보인다.
 * (admin-system.ts의 updateSetting과 같은 규칙)
 */
async function writeSetting(key: string, value: string | number, actorId: string): Promise<void> {
  const def = settingDef(key);
  if (!def) return;
  if (value === def.default) {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    return;
  }
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as never, category: def.category, updatedById: actorId },
    update: { value: value as never, updatedById: actorId },
  });
}

/** KST 기준 오늘 날짜 'YYYY-MM-DD'. 시즌 기준일은 날짜 단위로 다룬다. */
function todayKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function revalidateRankingViews() {
  revalidatePath('/hall-of-fame');
  revalidatePath('/community');
  revalidatePath('/console/seasons');
}

/**
 * 시즌 번호를 다시 1부터 센다 — 오늘이 시즌 1의 첫날이 된다.
 * 순위 자체는 건드리지 않는다(그건 랭킹 초기화의 몫이다).
 */
export async function resetSeasonNumbering(): Promise<SeasonActionState> {
  const user = await getUser();
  await requirePermission(user, 'ranking.manage');

  const today = todayKst();
  await writeSetting('season.epoch', today, user.id);
  await writeSetting('season.index_base', 1, user.id);
  await audit({
    actor: user,
    action: 'season.reset',
    targetType: 'season',
    summary: `시즌 번호 초기화 — ${today}부터 시즌 1`,
  });
  revalidateRankingViews();
  return { ok: `${today}부터 시즌 1로 다시 셉니다. 순위는 그대로입니다.` };
}

/** 현재 시즌 번호를 지정한 값으로 바꾼다 — 기준일은 오늘로 옮긴다. */
export async function setSeasonNumber(formData: FormData): Promise<SeasonActionState> {
  const user = await getUser();
  await requirePermission(user, 'ranking.manage');

  const index = Number(formData.get('index'));
  if (!Number.isInteger(index) || index < 1 || index > 9999) {
    return { error: '시즌 번호는 1~9999 사이의 정수여야 합니다.' };
  }

  const today = todayKst();
  await writeSetting('season.epoch', today, user.id);
  await writeSetting('season.index_base', index, user.id);
  await audit({
    actor: user,
    action: 'season.set',
    targetType: 'season',
    summary: `시즌 번호 변경 — ${today}부터 시즌 ${index}`,
  });
  revalidateRankingViews();
  return { ok: `${today}부터 시즌 ${index}입니다.` };
}

/**
 * 전체 랭킹 초기화 — 지금 이전의 활동을 집계에서 뺀다.
 * 되돌리려면 콘솔 › 런타임 설정에서 `ranking.reset_at`을 비우면 된다.
 */
export async function resetAllRankings(): Promise<SeasonActionState> {
  const user = await getUser();
  await requirePermission(user, 'ranking.manage');

  const at = new Date().toISOString();
  await writeSetting('ranking.reset_at', at, user.id);
  await audit({
    actor: user,
    action: 'ranking.reset',
    targetType: 'season',
    summary: `전체 랭킹 초기화 — ${at} 이전 활동 제외`,
  });
  revalidateRankingViews();
  return { ok: '모든 순위를 지금부터 다시 셉니다. (활동 기록은 지우지 않았습니다)' };
}

/** 전체 랭킹 초기화 해제 — 다시 전체 기록을 센다. */
export async function clearRankingFloor(): Promise<SeasonActionState> {
  const user = await getUser();
  await requirePermission(user, 'ranking.manage');

  await writeSetting('ranking.reset_at', '', user.id);
  await audit({
    actor: user,
    action: 'ranking.reset.clear',
    targetType: 'season',
    summary: '랭킹 집계 시작 시각 해제 — 전체 기록으로 다시 셈',
  });
  revalidateRankingViews();
  return { ok: '집계 시작 제한을 풀었습니다. 전체 기록으로 다시 셉니다.' };
}

/**
 * 계정 하나의 랭킹만 초기화 — 부정행위가 확인된 경우.
 * 이메일이나 표시 이름으로 찾는다(운영자가 손에 쥔 정보가 대개 그 둘이다).
 */
export async function resetUserRanking(formData: FormData): Promise<SeasonActionState> {
  const user = await getUser();
  await requirePermission(user, 'ranking.manage');

  const query = String(formData.get('query') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300);
  if (!query) return { error: '대상 계정을 입력해 주세요. (이메일 또는 이름)' };
  if (!reason) return { error: '사유를 남겨 주세요. 나중에 이의가 들어오면 이 기록이 근거가 됩니다.' };

  const target = await prisma.user.findFirst({
    where: { OR: [{ email: query }, { name: query }] },
    select: { id: true, name: true, email: true },
  });
  if (!target) return { error: '해당 계정을 찾지 못했습니다.' };

  await prisma.rankingReset.create({
    data: { userId: target.id, reason, byId: user.id },
  });
  await audit({
    actor: user,
    action: 'ranking.reset.user',
    targetType: 'user',
    targetId: target.id,
    summary: `${target.name} 랭킹 초기화 — ${reason}`,
  });
  revalidateRankingViews();
  return { ok: `${target.name} 계정을 이번 구간 순위에서 제외했습니다.` };
}

/** 개인 초기화 취소 — 잘못 처리했거나 이의가 받아들여진 경우. */
export async function undoUserRankingReset(formData: FormData): Promise<SeasonActionState> {
  const user = await getUser();
  await requirePermission(user, 'ranking.manage');

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: '대상을 찾지 못했습니다.' };

  const removed = await prisma.rankingReset.delete({ where: { id } }).catch(() => null);
  if (!removed) return { error: '이미 취소된 기록입니다.' };

  await audit({
    actor: user,
    action: 'ranking.reset.user.undo',
    targetType: 'user',
    targetId: removed.userId,
    summary: '개인 랭킹 초기화 취소',
  });
  revalidateRankingViews();
  return { ok: '개인 랭킹 초기화를 취소했습니다.' };
}
