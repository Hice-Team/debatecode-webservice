// 접속 기기 구분 — 서버에서 User-Agent로 판별한다.
//
// 왜 CSS 미디어쿼리로만 처리하지 않는가:
// 문제 풀이 에디터(Monaco + 채점 워커 + 디베이트 패널)는 화면이 좁아서 불편한 정도가 아니라
// 스마트폰에서 제대로 동작하지 않는다. 화면만 숨기면 무거운 번들은 그대로 내려가므로,
// 아예 렌더 전에 갈라 안내 화면을 준다.
//
// 태블릿은 허용한다 — 세로로도 에디터와 패널을 나눠 쓸 만한 폭이 나온다.
import { headers } from 'next/headers';

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

/** UA 문자열 하나로 판별한다 — 테스트에서 직접 부를 수 있도록 분리했다. */
export function classifyUserAgent(ua: string, mobileHint?: string | null): DeviceClass {
  const agent = ua.toLowerCase();

  // 클라이언트 힌트를 가장 먼저 본다.
  // Chrome 계열은 UA 문자열을 줄이면서(예: "Android 10; K") 기기 구분을 지워 버리지만,
  // `Sec-CH-UA-Mobile: ?1`은 휴대폰에서만 붙는다. 추측보다 이 신호가 정확하다.
  // (태블릿과 데스크톱은 둘 다 ?0이라 아래 UA 판별로 넘긴다.)
  if (mobileHint === '?1') return 'phone';

  // 태블릿을 먼저 본다. 안드로이드 태블릿은 UA에 'mobile'이 없고,
  // iPadOS 13+는 데스크톱 사파리를 흉내 내 'ipad' 대신 'macintosh'로 온다(터치로 구분).
  const isTablet =
    /ipad|android(?!.*mobile)|tablet|playbook|silk|kindle/.test(agent) ||
    (/macintosh/.test(agent) && /mobile|touch/.test(agent));
  if (isTablet) return 'tablet';

  if (/iphone|ipod|windows phone|blackberry|bb10|opera mini|iemobile/.test(agent)) return 'phone';
  if (/mobi|android/.test(agent)) return 'phone';

  return 'desktop';
}

/** 현재 요청의 기기 구분. 서버 컴포넌트·라우트 핸들러에서 쓴다. */
export async function getDeviceClass(): Promise<DeviceClass> {
  const list = await headers();
  return classifyUserAgent(list.get('user-agent') ?? '', list.get('sec-ch-ua-mobile'));
}

/** 문제 풀이·출제 에디터를 열 수 있는 기기인가. */
export function canUseEditor(device: DeviceClass): boolean {
  return device !== 'phone';
}
