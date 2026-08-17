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

export interface DeleteAccountState {
  error?: string;
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
  } catch {
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
