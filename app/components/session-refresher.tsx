'use client';

// 브라우저 Supabase 클라이언트가 만료 전 액세스 토큰을 갱신하고 쿠키를 최신으로 유지한다.
// 서버(RSC)의 verifySession은 이 쿠키를 읽어 세션을 검증한다.
//
// 갱신을 언제 **돌리지 않을지**가 이 파일의 실제 내용이다.
//
//   로그인하지 않았으면      갱신할 세션이 자체가 없다. 그런데도 타이머가 돌면
//                            방문자 전원이 매번 Supabase에 헛되이 요청을 보낸다.
//   브라우저가 오프라인이면  그 요청은 반드시 실패한다. SDK가 던지는
//                            `AuthRetryableFetchError: Failed to fetch`는 아무도 받지
//                            않아 콘솔에 그대로 쌓였다 — 실제로 그 상태였다.
//
// 그래서 세션이 있을 때만, 그리고 온라인일 때만 돌린다.
import { useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/client';

export default function SessionRefresher() {
  useEffect(() => {
    const supabase = createClient();
    let disposed = false;

    // 다른 탭의 로그인/로그아웃과 동기화한다. 이 구독 자체는 네트워크를 쓰지 않는다.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      // 로그아웃하면 갱신할 것이 없다 — 타이머를 멈춘다
      if (session) resume();
      else void supabase.auth.stopAutoRefresh();
    });

    function resume() {
      // navigator.onLine은 "랜선이 꽂혀 있다" 정도만 보장하지만, 확실한 오프라인을
      // 걸러 내는 것만으로 실패의 대부분이 사라진다.
      if (disposed || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      // 이 호출은 실패해도 조용히 넘어간다 — 갱신은 다음 기회에 다시 시도된다
      void supabase.auth.startAutoRefresh().catch(() => {});
    }

    function pause() {
      void supabase.auth.stopAutoRefresh().catch(() => {});
    }

    // 세션이 있을 때만 시작한다. 로그인하지 않은 방문자에게는 아무 요청도 나가지 않는다.
    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) resume();
      })
      // 첫 조회가 실패해도 화면은 그대로다 — 서버가 쿠키로 다시 판단한다
      .catch(() => {});

    window.addEventListener('online', resume);
    window.addEventListener('offline', pause);

    return () => {
      disposed = true;
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', pause);
      data.subscription.unsubscribe();
      pause();
    };
  }, []);

  return null;
}
