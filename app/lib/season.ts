// 시즌 — 랭킹을 세는 구간.
//
// 예전에는 "매주 월요일"과 시작 기준일이 코드에 박혀 있었다. 그래서 "이번 주부터 시즌 1로
// 다시 시작한다" 같은 운영 판단에도 배포가 필요했다. 이제 기준일·길이·시작 번호를 런타임
// 설정에서 읽는다(app/lib/settings.ts의 season.*).
//
// 여전히 별도의 시즌 표나 배치 작업은 없다. 시즌은 "언제부터 언제까지"라는 구간일 뿐이고,
// 랭킹은 그 구간의 활동 기록으로 매번 다시 집계된다(app/lib/ranking.ts). 구간이 옮겨 가면
// 아무것도 하지 않아도 새 시즌 순위가 된다.
//
// 시간대를 KST로 고정하는 이유: 이용자가 한국 기준으로 "이번 주"를 센다. 서버가 어디서 돌든
// 경계가 같아야 하므로 UTC 오프셋을 직접 더해 계산한다.
import { getSetting } from './settings';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 기본값 — 설정을 읽지 못해도 예전과 같은 시즌 경계로 동작한다. */
const DEFAULT_EPOCH_MS = Date.UTC(2025, 0, 5, 15, 0, 0); // 2025-01-06 00:00 KST
const DEFAULT_LENGTH_MS = 7 * DAY_MS;

export interface SeasonConfig {
  epochMs: number;
  lengthMs: number;
  /** 기준일의 시즌 번호 */
  indexBase: number;
}

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  epochMs: DEFAULT_EPOCH_MS,
  lengthMs: DEFAULT_LENGTH_MS,
  indexBase: 1,
};

/** 'YYYY-MM-DD'(KST 00:00 기준)를 ms로. 형식이 어긋나면 기본 기준일을 쓴다. */
export function parseEpoch(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return DEFAULT_EPOCH_MS;
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d)) - KST_OFFSET_MS;
}

/** 콘솔 설정을 반영한 시즌 구성 — 서버에서만 쓴다. */
export async function getSeasonConfig(): Promise<SeasonConfig> {
  const [epoch, lengthDays, indexBase] = await Promise.all([
    getSetting<string>('season.epoch'),
    getSetting<number>('season.length_days'),
    getSetting<number>('season.index_base'),
  ]);
  return {
    epochMs: parseEpoch(epoch),
    lengthMs: Math.max(1, Math.round(lengthDays)) * DAY_MS,
    indexBase: Math.max(1, Math.round(indexBase)),
  };
}

export interface Season {
  /** 1부터 세는 시즌 번호 */
  index: number;
  start: Date;
  /** 다음 시즌 시작 시각 — 이 구간은 [start, end) */
  end: Date;
}

/** 그 시각이 속한 시즌. 구성을 넘기지 않으면 기본값(주간 · 2025-01-06 시작)으로 센다. */
export function seasonAt(now: Date = new Date(), config: SeasonConfig = DEFAULT_SEASON_CONFIG): Season {
  const { epochMs, lengthMs, indexBase } = config;
  const elapsed = now.getTime() - epochMs;
  // 기준일 이전이면(시계가 어긋났거나 기준일을 미래로 둔 경우) 첫 시즌으로 본다
  const step = elapsed < 0 ? 0 : Math.floor(elapsed / lengthMs);
  const startMs = epochMs + step * lengthMs;
  return { index: indexBase + step, start: new Date(startMs), end: new Date(startMs + lengthMs) };
}

/** 콘솔 설정까지 반영한 현재 시즌 — 서버 컴포넌트/액션에서 쓴다. */
export async function currentSeason(now: Date = new Date()): Promise<Season> {
  return seasonAt(now, await getSeasonConfig());
}

export function previousSeason(season: Season): Season {
  const lengthMs = season.end.getTime() - season.start.getTime();
  return {
    index: Math.max(1, season.index - 1),
    start: new Date(season.start.getTime() - lengthMs),
    end: new Date(season.start),
  };
}

/** 시즌이 끝나기까지 남은 밀리초 (음수가 되지 않는다). */
export function msUntilSeasonEnd(season: Season, now: Date = new Date()): number {
  return Math.max(0, season.end.getTime() - now.getTime());
}

/** 시즌 경과 비율 0~1 — 진행 바에 쓴다. */
export function seasonProgress(season: Season, now: Date = new Date()): number {
  const total = season.end.getTime() - season.start.getTime();
  const done = now.getTime() - season.start.getTime();
  return Math.min(1, Math.max(0, done / total));
}

/** M/D (KST) — 시즌 구간 표기용. end는 구간의 끝이라 하루 빼서 "마지막 날"로 보여준다. */
function kstMonthDay(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCMonth() + 1}.${kst.getUTCDate()}`;
}

/** "1.6 – 1.12" 꼴의 구간 라벨 */
export function seasonRangeLabel(season: Season): string {
  const lastDay = new Date(season.end.getTime() - 1);
  return `${kstMonthDay(season.start)} – ${kstMonthDay(lastDay)}`;
}

/** 남은 시간을 "3일 4시간" / "4시간 12분" 꼴로. 마지막 1시간은 분만 보여준다. */
export function formatRemaining(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
