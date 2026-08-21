'use client';

// 비즈니스용 도메인 안내 — debatecode.hicecorp.com으로 들어온 방문자에게만 뜬다.
//
// 같은 서비스가 두 주소로 열린다. 하나는 이용자가 쓰는 서비스 도메인이고, 다른 하나는
// 소개·심사·제휴 문의처럼 "둘러보는" 목적의 회사 도메인이다. 구분이 없으면 이쪽으로 들어온
// 사람이 여기에 계정을 만들고 글을 쓰기 시작하는데, 그러면 나중에 도메인을 정리할 때
// 그 기록을 어떻게 옮길지가 문제가 된다.
//
// 서버에서 판단하지 않는 이유: 호스트는 요청마다 다르고, 이 배너 하나 때문에 모든 페이지의
// 캐시를 호스트별로 나누면 손해가 크다. 화면에 뜬 뒤 판단해도 늦지 않은 정보다.
import { useSyncExternalStore } from 'react';

/** 비즈니스용 도메인 — 여기로 들어오면 둘러보기 안내를 띄운다. */
const BUSINESS_HOSTS = ['debatecode.hicecorp.com'];

const noopSubscribe = () => () => {};

function readIsBusinessHost(): boolean {
  return BUSINESS_HOSTS.includes(window.location.hostname);
}

export default function DomainNotice() {
  // 서버 스냅샷은 false — 하이드레이션 불일치 없이 첫 렌더를 넘긴다
  const isBusinessHost = useSyncExternalStore(noopSubscribe, readIsBusinessHost, () => false);
  if (!isBusinessHost) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-center text-xs font-medium leading-relaxed text-amber-950"
    >
      <span>본 도메인은 비즈니스용 도메인으로 서비스 둘러보기만 가능합니다.</span>
      <a
        href="https://debatecode.org"
        className="shrink-0 rounded-full border border-current/30 bg-white/20 px-3 py-1 text-[11px] font-semibold transition-colors hover:bg-white/35"
      >
        서비스 이용하러 가기 →
      </a>
    </div>
  );
}
