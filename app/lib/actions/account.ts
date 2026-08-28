'use server';

// 회원 탈퇴 — 개인정보처리방침이 약속한 "탈퇴 즉시 지체 없이 파기"를 실제로 수행한다.
//
// 지우는 순서가 중요하다. 스키마의 onDelete: Cascade가 걸린 관계도 있지만 전부는 아니라서,
// 자식부터 명시적으로 지우고 마지막에 User와 인증 계정을 지운다. 하나라도 남으면 외래키
// 제약으로 탈퇴 자체가 실패하고, 이용자는 "탈퇴가 안 된다"는 상태에 갇힌다.
//
// 공용 기록(신고·문의)은 행을 지우는 대신 작성자 연결만 끊는다. 남의 신고를 처리하던 이력까지
// 사라지면 운영 기록이 무너지기 때문이다. 개인 식별 정보는 User와 함께 사라진다.
import { redirect } from 'next/navigation';
import { prisma } from '../prisma';
import { verifySession } from '../dal';
import { createClient } from '../supabase/server';
import { createAdminClient } from '../supabase/admin';
import { DELETE_CONFIRM_PHRASE } from '../account-policy';
import { requireSecondFactor, type SecondFactorProof } from '../two-factor';

/**
 * 폼에서 2차 인증 증거를 꺼낸다.
 *
 * 보안키는 브라우저의 `navigator.credentials.get()` 결과(JSON)를 hidden 필드에 담아 보낸다 —
 * 서버 액션은 FormData만 받으므로 구조체를 그대로 넘길 자리가 없다.
 */
function readSecondFactorProof(formData: FormData): SecondFactorProof | null {
  const assertion = String(formData.get('webauthn') ?? '').trim();
  if (assertion) {
    try {
      return { method: 'webauthn', response: JSON.parse(assertion) };
    } catch {
      return null;
    }
  }
  const backup = String(formData.get('backupCode') ?? '').trim();
  if (backup) return { method: 'backup', code: backup };

  const totp = String(formData.get('totpCode') ?? '').trim();
  if (totp) return { method: 'totp', code: totp };

  return null;
}

export interface DeleteAccountState {
  error?: string;
  /** 2차 인증이 걸린 계정이면 어떤 수단을 쓸 수 있는지 화면에 알려 준다 */
  needsSecondFactor?: { totp: boolean; securityKeys: number; backupCodesLeft: number };
}

export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const { userId } = await verifySession();

  const typed = String(formData.get('confirm') ?? '').trim();
  if (typed !== DELETE_CONFIRM_PHRASE) {
    return { error: `확인 문구가 일치하지 않습니다. "${DELETE_CONFIRM_PHRASE}"를 그대로 입력해 주세요.` };
  }

  /* ---------- 2차 인증 확인 ----------
     탈퇴는 되돌릴 수 없다. 세션이 탈취된 상태에서 계정이 지워지면 되찾을 방법이 없고,
     그건 2차 인증이 막아야 하는 바로 그 상황이다. 그래서 2차 인증을 설정해 둔 계정에는
     여기서 한 번 더 확인을 받는다.

     설정하지 않은 계정에는 요구하지 않는다 — 없는 수단을 요구하면 탈퇴가 막힌다. */
  const proof = readSecondFactorProof(formData);
  const verified = await requireSecondFactor(userId, proof);
  if (!verified.ok) {
    return {
      error: verified.error,
      needsSecondFactor: verified.required
        ? {
            totp: verified.required.totp,
            securityKeys: verified.required.securityKeys,
            backupCodesLeft: verified.required.backupCodesLeft,
          }
        : undefined,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1) 커뮤니티 — 투표 → 답글 → 좋아요 → 글 순. 글을 지우면 첨부는 따라 지워진다.
      await tx.pollVote.deleteMany({ where: { userId } });
      await tx.comment.deleteMany({ where: { authorId: userId } });
      await tx.postLike.deleteMany({ where: { userId } });
      await tx.post.deleteMany({ where: { authorId: userId } });

      // 2) 풀이 기록 — 면접 세션이 제출을 참조하므로 면접부터 지운다
      await tx.interviewSession.deleteMany({ where: { userId } });
      await tx.debateQSession.deleteMany({ where: { userId } });
      await tx.debateAiChat.deleteMany({ where: { userId } });
      await tx.runAttempt.deleteMany({ where: { userId } });
      await tx.submission.deleteMany({ where: { userId } });

      // 3) 학습·보관함
      await tx.lessonProgress.deleteMany({ where: { userId } });
      await tx.bookmark.deleteMany({ where: { userId } });
      await tx.workbook.deleteMany({ where: { userId } });

      // 4) 포인트·상점
      await tx.shopOrder.deleteMany({ where: { userId } });
      await tx.pointRequest.deleteMany({ where: { userId } });
      await tx.pointLedger.deleteMany({ where: { userId } });

      // 5) AI Search 대화 (메시지는 cascade)
      await tx.aiSession.deleteMany({ where: { userId } });

      // 6) 출제·메이트·보안 기록
      await tx.problemDraft.deleteMany({ where: { authorId: userId } });
      await tx.debateMateApplication.deleteMany({ where: { userId } });
      await tx.sanction.deleteMany({ where: { userId } });
      await tx.loginEvent.deleteMany({ where: { userId } });
      // 2차 인증 수단 — 예전에는 이 두 줄이 없었고, 관계가 RESTRICT라서
      // 보안키나 백업 코드를 만든 계정은 탈퇴 자체가 외래키 제약으로 실패했다.
      // 이제 스키마도 CASCADE지만, 무엇이 지워지는지 여기에 남겨 둔다.
      await tx.backupCode.deleteMany({ where: { userId } });
      await tx.webauthnKey.deleteMany({ where: { userId } });
      // 채점 세션·AI 사용 카운터
      await tx.judgeSession.deleteMany({ where: { userId } });
      await tx.aiUsageCounter.deleteMany({ where: { userId } });

      // 7) 공용 운영 기록 — 행은 남기고 작성자 연결만 끊는다
      await tx.inquiry.updateMany({ where: { userId }, data: { userId: null } });

      // 8) 마케팅 명단 — 계정 연결을 끊고 수신거부 처리한다.
      //    탈퇴한 사람에게 홍보 메일이 계속 가면 안 되고, 동의·철회 이력 자체는 남겨야 한다.
      await tx.marketingContact.updateMany({
        where: { userId },
        data: { userId: null, unsubscribedAt: new Date() },
      });

      // 9) 마지막으로 프로필 — 암호화된 API 키와 개인정보가 여기서 함께 사라진다
      await tx.user.delete({ where: { id: userId } });
    });
  } catch (error) {
    // 원인을 남긴다. 예전에는 조용히 삼켜서, 외래키 제약으로 막혀 있어도
    // "문제가 발생했습니다"만 보이고 무엇이 걸렸는지 알 방법이 없었다.
    console.error('[deleteAccount] 삭제 실패', { userId, error });
    return { error: '탈퇴 처리 중 문제가 발생했습니다. 잠시 후 다시 시도하거나 문의해 주세요.' };
  }

  // 인증 계정 삭제 — 서비스 롤 키가 없는 환경에서는 프로필만 지워진 상태가 되므로,
  // 로그아웃까지는 반드시 수행해 다시 접근하지 못하게 한다.
  try {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // 인증 계정 삭제 실패 — 프로필은 이미 사라졌고 재로그인해도 복구되지 않는다
  }

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // 쿠키 정리 실패는 리다이렉트 후 세션 검증에서 걸러진다
  }

  redirect('/?left=1');
}
