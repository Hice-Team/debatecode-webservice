import { permanentRedirect } from 'next/navigation';

// 구 경로 — 회원·권한 관리가 /console/access/* 로 나뉘었다.
// 한 화면에 역할 변경·제재·이력·일괄작업이 모두 있어서 무엇을 하는 화면인지 흐려졌고,
// 사유나 확인 없이 권한이 바뀌는 것도 여기서 비롯됐다.
// 북마크와 예전 링크를 살리기 위해 디렉터리로 넘긴다.
export default function LegacyMembersPage() {
  permanentRedirect('/console/access/directory');
}
