import type { AuthError } from '@supabase/supabase-js';

// Supabase 에러를 한국어 사용자 메시지로 매핑 — auth/signup 액션에서 공통으로 사용.
// 'use server' 파일은 async 함수만 export할 수 있어 별도 모듈로 둔다.
export function mapAuthError(error: AuthError): string {
  switch (error.code) {
    case 'user_already_exists':
      return '이미 가입된 이메일입니다.';
    case 'invalid_credentials':
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    case 'email_not_confirmed':
      return '이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.';
    case 'otp_expired':
      return '인증 코드가 만료되었거나 올바르지 않습니다. 코드를 다시 요청해 주세요.';
    case 'over_email_send_rate_limit':
      return '이메일 발송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
    case 'same_password':
      return '이전과 다른 비밀번호를 사용해 주세요.';
    case 'provider_disabled':
    case 'validation_failed':
      return '현재 이 로그인 방식은 사용할 수 없습니다. 다른 방법으로 시도해 주세요.';
    default:
      return error.message;
  }
}
