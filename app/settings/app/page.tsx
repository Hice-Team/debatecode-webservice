import { redirect } from 'next/navigation';

// 통합 설정 페이지로 이동 (기존 링크 호환)
export default function AppSettingsRedirect() {
  redirect('/settings#service');
}
