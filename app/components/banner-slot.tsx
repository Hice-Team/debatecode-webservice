'use client';

// 전역 안내 줄을 감싸는 자리 — 화면에 따라 통째로 뺀다.
//
// 문제 풀이 화면(코드 에디터)은 위아래가 꽉 찬 작업 화면이다. 여기에 상단 배너 한 줄이
// 더해지면 에디터와 실행 결과 패널이 그만큼 밀려 내려가고, 전체 화면 계산(100dvh)도
// 어긋난다. 안내는 다른 화면에서 이미 보여 주므로 작업 중에는 비운다.
//
// 서버 컴포넌트인 배너를 children으로 받아 조건만 여기서 판단한다 — 배너 자체를
// 클라이언트로 내리면 설정 조회까지 브라우저로 따라와야 한다.
import { usePathname } from 'next/navigation';
import { isSolveWorkspace } from '@/app/lib/solve-route';

export default function BannerSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isSolveWorkspace(pathname)) return null;
  return <>{children}</>;
}
