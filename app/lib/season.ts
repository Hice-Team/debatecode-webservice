// 명예의 전당 시즌 — 한 주가 한 시즌이다.
//
// 매주 월요일 00:00(KST)에 시즌이 바뀌고 순위가 0에서 다시 시작한다. 별도의 배치 작업이나
// 저장 테이블은 두지 않는다. 시즌은 "언제부터 언제까지"라는 구간일 뿐이고, 랭킹은 그 구간의
// 활동 기록으로 매번 다시 집계된다(app/lib/ranking.ts). 그래서 주가 넘어가는 순간
// 아무것도 하지 않아도 새 시즌 순위가 된다.
//
// 시간대를 KST로 고정하는 이유: 이용자가 한국 기준으로 "이번 주"를 센다. 서버가 어디서 돌든
// 경계가 같아야 하므로 UTC 오프셋을 직접 더해 계산한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 시즌 1이 시작한 월요일 00:00 KST (= 2025-01-06 00:00 KST) */
const SEASON_EPOCH_MS = Date.UTC(2025, 0, 5, 15, 0, 0);

export interface Season {
  /** 1부터 세는 시즌 번호 */
  index: number;
  start: Date;
  /** 다음 시즌 시작 시각 — 이 구간은 [start, end) */
  end: Date;
}

/** 그 시각이 속한 시즌. */
export function seasonAt(now: Date = new Date()): Season {
  const elapsed = now.getTime() - SEASON_EPOCH_MS;
  // 에폭 이전이면(시계가 어긋난 경우 등) 1주차로 본다
  const week = elapsed < 0 ? 0 : Math.floor(elapsed / WEEK_MS);
  const startMs = SEASON_EPOCH_MS + week * WEEK_MS;
  return { index: week + 1, start: new Date(startMs), end: new Date(startMs + WEEK_MS) };
}

export function previousSeason(season: Season): Season {
  return {
    index: Math.max(1, season.index - 1),
    start: new Date(season.start.getTime() - WEEK_MS),
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
