// proxy.ts(구 middleware)와 서버 컴포넌트가 주고받는 헤더 키.
//
// 상수를 proxy.ts에 두고 컴포넌트가 그 파일을 import하면, Edge 런타임 전용 모듈이
// 서버 번들에 딸려 들어간다. 값만 별도 파일로 빼서 양쪽이 같은 이름을 쓰게 한다.

/** 현재 요청 경로 — 레이아웃에서는 pathname을 알 수 없어 proxy가 찍어 준다. */
export const PATHNAME_HEADER = 'x-dc-pathname';
