'use server';

// 보안키(WebAuthn) 관리 — 등록은 브라우저 API가 필요해 라우트 핸들러가 맡고
// (app/api/settings/webauthn/register/*), 여기서는 목록에서 지우는 일만 한다.
import { revalidatePath } from 'next/cache';
import { verifySession } from '../dal';
import { prisma } from '../prisma';
import {
  getTwoFactorState,
  requireSecondFactor,
  revokeVerifiedSessions,
  type SecondFactorProof,
} from '../two-factor';

/**
 * 등록된 보안키를 하나 지운다.
 *
 * where에 userId를 반드시 함께 건다 — id만으로 지우면 남의 키 id를 알아낸 사람이
 * 그 사람의 보안키를 지울 수 있다(계정 탈취의 사전 작업이 된다).
 *
 * **마지막 남은 키는 확인 없이 지우지 않는다.** 보안키가 하나뿐인데 그것을 지우면
 * 그 계정의 2차 인증이 사라진다 — 세션을 훔친 사람이 가장 먼저 할 일이 그것이다.
 * 여러 개 중 하나를 정리하는 것(기기를 바꿨다 등)은 그대로 둔다.
 */
export async function deleteWebauthnKey(formData: FormData): Promise<void> {
  const session = await verifySession();
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const state = await getTwoFactorState(session.userId);
  const isLastFactor = state.securityKeys <= 1 && !state.totp;
  if (isLastFactor) {
    const proof = readProof(formData);
    const verified = await requireSecondFactor(session.userId, proof);
    if (!verified.ok) return;
  }

  await prisma.webauthnKey.deleteMany({ where: { id, userId: session.userId } });
  // 수단이 바뀌었다 — 통과 기록을 비워 다음 요청부터 다시 확인받게 한다
  await revokeVerifiedSessions(session.userId);
  revalidatePath('/settings');
}

/** 폼에 담겨 온 2차 인증 증거 — 보안키 응답(JSON) 또는 백업 코드. */
function readProof(formData: FormData): SecondFactorProof | null {
  const assertion = String(formData.get('webauthn') ?? '').trim();
  if (assertion) {
    try {
      return { method: 'webauthn', response: JSON.parse(assertion) };
    } catch {
      return null;
    }
  }
  const backup = String(formData.get('backupCode') ?? '').trim();
  return backup ? { method: 'backup', code: backup } : null;
}
