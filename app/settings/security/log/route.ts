// 보안 로그 내려받기 — 로그인 기록을 CSV로.
//
// 화면에는 최근 몇 건만 보여 준다. "언제부터 이 기기가 들어왔지"처럼 흐름을 봐야 하는
// 질문은 표를 넘기며 답할 수 있는 것이 아니라, 정렬하고 걸러 봐야 답이 나온다.
// 그래서 스프레드시트로 열리는 형식으로 내려보낸다.
//
// IP 원문은 애초에 저장하지 않는다(LoginEvent.ipMasked). 여기서도 마스킹된 값만 나간다.
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { durableRateLimit, retryAfterLabel } from '@/app/lib/rate-limit-durable';

/** CSV 한 칸 — 쉼표·따옴표·줄바꿈이 들어가도 칸이 밀리지 않게 감싼다 */
function cell(value: string | number | boolean | null): string {
  const s = value === null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const { userId } = await verifySession();

  const gate = await durableRateLimit(`security-log:${userId}`, 10, 60 * 60 * 1000);
  if (!gate.allowed) {
    return new Response(
      `잠시 후 다시 시도해 주세요. (${retryAfterLabel(gate.retryAfterMs)} 후)`,
      { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const events = await prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    select: { createdAt: true, ipMasked: true, userAgent: true, isNew: true },
  });

  const rows = [
    ['시각(ISO)', '시각(KST)', 'IP(마스킹)', '새 위치', 'User-Agent'],
    ...events.map((e) => [
      e.createdAt.toISOString(),
      e.createdAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      e.ipMasked,
      e.isNew ? '예' : '아니오',
      e.userAgent ?? '',
    ]),
  ];

  // BOM을 붙인다 — 없으면 엑셀이 UTF-8을 못 알아보고 한글이 깨진다
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="debatecode-security-log-${stamp}.csv"`,
      'cache-control': 'no-store, private',
    },
  });
}
