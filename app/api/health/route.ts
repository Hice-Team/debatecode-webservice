import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getSessionWithProfile } from '@/app/lib/dal';
import { hasConsoleAccess } from '@/app/lib/roles';

// GET /api/health — 배포 후 상태 점검 창구.
//
// 익명/일반 사용자에게는 살아 있는지만 알려준다(정보 노출 방지). 콘솔 권한자에게만
// 각 의존성의 상세를 내려보내고, 콘솔 › 시스템 › 상태 화면이 이 응답을 그린다.
//
// 여기서 외부 API를 실제로 호출하지는 않는다 — 헬스체크가 쿼터를 태우면 안 되고,
// Workers CPU 시간도 짧다. "키가 꽂혀 있는가"까지만 확인하고, 실제 호출 실패는
// 각 기능의 에러 경로에서 드러난다.

export const dynamic = 'force-dynamic';

type Status = 'ok' | 'degraded' | 'down' | 'unconfigured';

interface Check {
  key: string;
  label: string;
  status: Status;
  detail: string;
  /** 왕복 시간(ms) — 측정한 항목만 */
  latencyMs?: number;
}

function configured(...names: string[]): boolean {
  return names.some((n) => Boolean(process.env[n]));
}

async function checkDatabase(): Promise<Check> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    return {
      key: 'database',
      label: '데이터베이스',
      // Supabase pooler 왕복이 1초를 넘으면 사용자 체감이 이미 나쁘다
      status: latencyMs > 1000 ? 'degraded' : 'ok',
      detail: `Supabase Postgres · ${latencyMs}ms`,
      latencyMs,
    };
  } catch (error) {
    return {
      key: 'database',
      label: '데이터베이스',
      status: 'down',
      detail: error instanceof Error ? error.message.slice(0, 200) : '연결 실패',
      latencyMs: Date.now() - started,
    };
  }
}

function checkSupabaseAuth(): Check {
  const ok = configured('NEXT_PUBLIC_SUPABASE_URL') && configured('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return {
    key: 'supabase_auth',
    label: 'Supabase 인증',
    status: ok ? 'ok' : 'down',
    detail: ok
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host
      : 'NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 미설정 — 빌드 변수인지 확인 (DEPLOY.md)',
  };
}

function checkServiceRole(): Check {
  const ok = configured('SUPABASE_SERVICE_ROLE_KEY');
  return {
    key: 'supabase_service',
    label: 'Supabase 서비스 키',
    status: ok ? 'ok' : 'unconfigured',
    detail: ok ? '설정됨' : '미설정 — 관리자용 Storage/Auth 작업이 실패한다',
  };
}

function checkEncryption(): Check {
  const primary = configured('AI_SECRET_KEY');
  const secondary = configured('AI_SECRET_KEY_2');
  return {
    key: 'encryption',
    label: '개인정보 암호화 키',
    status: primary ? (secondary ? 'ok' : 'degraded') : 'down',
    detail: primary
      ? secondary
        ? '1차·2차 키 설정됨'
        : '1차 키만 설정됨 — 2차 키(AI_SECRET_KEY_2) 권장'
      : 'AI_SECRET_KEY 미설정 — 생년월일·API 키 복호화가 실패한다',
  };
}

function checkFreeAi(): Check {
  const providers: Array<[string, string[]]> = [
    ['OpenAI', ['OPENAI_API_KEY']],
    ['Groq', ['GROQ_API_KEY']],
    ['Google AI', ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY']],
    ['xAI', ['GROK_API_KEY', 'XAI_API_KEY']],
    ['Hugging Face', ['HUGGINGFACE_API_KEY', 'HF_TOKEN']],
    ['Anthropic', ['ANTHROPIC_API_KEY']],
  ];
  const live = providers.filter(([, names]) => configured(...names)).map(([label]) => label);
  return {
    key: 'free_ai',
    label: 'Debate Free AI 업스트림',
    // 하나도 없으면 규칙 기반 폴백으로 내려가므로 장애는 아니지만 품질이 떨어진다
    status: live.length === 0 ? 'degraded' : 'ok',
    detail: live.length === 0 ? '키 없음 — 규칙 기반 폴백으로 동작' : `${live.length}개 가용: ${live.join(', ')}`,
  };
}

function checkEmail(): Check {
  const ok = configured('RESEND_API_KEY');
  return {
    key: 'email',
    label: '메일 발송',
    status: ok ? 'ok' : 'unconfigured',
    detail: ok
      ? `Resend · 발신 ${process.env.EMAIL_FROM || '기본 주소'}`
      : 'RESEND_API_KEY 미설정 — 발송은 dry-run으로 기록만 남는다',
  };
}

function checkWebauthn(): Check {
  const ok = configured('NEXT_PUBLIC_WEBAUTHN_RPID') && configured('NEXT_PUBLIC_WEBAUTHN_ORIGIN');
  return {
    key: 'webauthn',
    label: '보안키(WebAuthn)',
    status: ok ? 'ok' : 'unconfigured',
    detail: ok ? process.env.NEXT_PUBLIC_WEBAUTHN_RPID! : '미설정 — 보안키 등록이 도메인 불일치로 실패할 수 있다',
  };
}

const WORST: Record<Status, number> = { ok: 0, unconfigured: 1, degraded: 2, down: 3 };

export async function GET() {
  const database = await checkDatabase();
  const checks: Check[] = [
    database,
    checkSupabaseAuth(),
    checkServiceRole(),
    checkEncryption(),
    checkFreeAi(),
    checkEmail(),
    checkWebauthn(),
  ];

  // 전체 상태는 가장 나쁜 항목을 따른다. 다만 unconfigured(선택 기능 미설정)는
  // 장애가 아니므로 전체를 ok로 유지한다.
  const worst = checks.reduce<Status>((acc, c) => (WORST[c.status] > WORST[acc] ? c.status : acc), 'ok');
  const overall: Status = worst === 'unconfigured' ? 'ok' : worst;
  const httpStatus = overall === 'down' ? 503 : 200;

  // 세션 조회가 실패해도 헬스체크 자체는 응답해야 한다
  const viewer = await getSessionWithProfile().catch(() => null);
  if (!viewer || !hasConsoleAccess(viewer.role)) {
    return NextResponse.json({ ok: overall !== 'down' }, { status: httpStatus });
  }

  return NextResponse.json(
    {
      ok: overall !== 'down',
      status: overall,
      checkedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      checks,
    },
    { status: httpStatus },
  );
}
