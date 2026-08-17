'use client';

// proxy.ts(Node 미들웨어)는 Cloudflare Workers/OpenNext에서 지원되지 않아 제거했다.
// 미들웨어가 매 요청 하던 세션 쿠키 갱신을 대신해, 브라우저 Supabase 클라이언트를
// 앱 전역에 상시 마운트한다. autoRefreshToken이 만료 전 액세스 토큰을 백그라운드로
// 갱신하고 쿠키를 최신으로 유지하므로, 서버(RSC)의 verifySession이 그 쿠키를 읽어
// 검증할 수 있다. 서버 액션·라우트 핸들러는 쓰기 가능한 쿠키 컨텍스트라 별도 갱신된다.
import { useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/client';

export default function SessionRefresher() {
  useEffect(() => {
    const supabase = createClient();
    // 클라이언트 인스턴스가 살아있는 동안 자동 갱신 타이머가 돈다(브라우저에서는
    // 탭 가시성 변화도 SDK가 자체 처리). 구독으로 참조를 유지하고 다른 탭의
    // 로그인/로그아웃과도 동기화한다.
    const { data } = supabase.auth.onAuthStateChange(() => {});
    return () => data.subscription.unsubscribe();
  }, []);

  return null;
}
