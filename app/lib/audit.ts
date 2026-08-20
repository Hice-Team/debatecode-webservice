// 감사 로그 — 콘솔에서 일어난 모든 상태 변경을 남긴다.
//
// 왜 필요한가: 권한이 바뀌거나 제재가 걸렸을 때 "누가, 언제, 왜"를 답할 수 없으면
// 이의제기에 대응할 수 없고, 운영진 사이의 사고도 추적되지 않는다. 되돌리기의 근거이기도 하다.
//
// 규칙 둘:
//   1) 기록 실패가 본 작업을 막지 않는다. 감사 로그를 못 남겼다고 제재 해제가 실패하면
//      곤란하다 — 삼켜서 서버 로그로만 흘린다.
//   2) 행위자 이름·역할을 스냅샷으로 박는다. 나중에 조인하면 "그때 어떤 권한으로 했는지"가
//      지금 값으로 바뀌어 버린다.
import { headers } from 'next/headers';
import { prisma } from './prisma';
import { roleLabel } from './roles';

/** 감사 액션 키 — 화면 필터와 라벨이 이 목록을 쓴다. */
export const AUDIT_ACTIONS = {
  'role.change': '역할 변경',
  'role.change.bulk': '역할 일괄 변경',
  'permission.grant': '권한 부여',
  'permission.revoke': '권한 회수',

  'sanction.issue': '제재 발급',
  'sanction.issue.bulk': '제재 일괄 발급',
  'sanction.lift': '제재 해제',
  'sanction.appeal.resolve': '이의제기 처리',

  'report.resolve': '신고 처리완료',
  'report.dismiss': '신고 기각',
  'report.assign': '신고 담당자 지정',
  'report.priority': '신고 우선순위 변경',
  'report.note': '신고 내부 메모',

  'inquiry.answer': '문의 답변',
  'inquiry.update': '문의 답변 수정',
  'inquiry.close': '문의 보관',
  'inquiry.reopen': '문의 재개',
  'inquiry.assign': '문의 담당자 지정',

  'problem.draft.approve': '문제 초안 승인',
  'problem.draft.reject': '문제 초안 반려',
  'problem.draft.edit': '문제 초안 수정',
  'problem.bulk.import': '문제 일괄 등록',
  'problem.update': '문제 수정',
  'problem.delete': '문제 삭제',

  'mate.approve': '메이트 승인',
  'mate.reject': '메이트 반려',
  'mate.revoke': '메이트 권한 회수',
  'mate.warn': '메이트 경고',

  'post.delete': '게시글 삭제',
  'post.pin': '공지 상단 고정',
  'post.unpin': '공지 고정 해제',
  'point.adjust': '포인트 수동 조정',
  'security.recovery_email': '복구 이메일 변경',

  'system.test_mail': '테스트 메일 발송',
  'setting.update': '런타임 설정 변경',
  'setting.reset': '런타임 설정 초기화',
  'maintenance.on': '유지보수 모드 시작',
  'maintenance.off': '유지보수 모드 해제',


  'season.reset': '시즌 번호 초기화',
  'season.set': '시즌 번호 변경',
  'ranking.reset': '전체 랭킹 초기화',
  'ranking.reset.clear': '랭킹 집계 제한 해제',
  'ranking.reset.user': '개인 랭킹 초기화',
  'ranking.reset.user.undo': '개인 랭킹 초기화 취소',

  'announcement.publish': '공지 게시',
  'marketing.send': '홍보 메일 발송',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}

export type AuditTargetType =
  | 'user'
  | 'report'
  | 'inquiry'
  | 'problemDraft'
  | 'problem'
  | 'sanction'
  | 'setting'
  | 'season'
  | 'mate'
  | 'post'
  | 'macro'
  | 'announcement'
  | 'campaign';

export interface AuditActor {
  id: string;
  name: string;
  role: string;
}

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  /** 목록에서 한 줄로 읽히는 요약 — "강*호를 검토자로 변경 (사유: 운영팀 합류)" */
  summary: string;
  /** 값이 바뀐 경우의 전/후. 되돌릴 때의 근거가 된다. */
  diff?: { before?: unknown; after?: unknown };
}

/** 원본 IP는 저장하지 않는다 — 마지막 옥텟만 가린 표시용 값만 남긴다. */
async function maskedIp(): Promise<string | null> {
  try {
    const h = await headers();
    const raw = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
    if (!raw) return null;
    if (raw.includes(':')) {
      // IPv6 — 앞 4그룹만 남긴다
      return `${raw.split(':').slice(0, 4).join(':')}::x`;
    }
    const parts = raw.split('.');
    return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.x` : null;
  } catch {
    return null;
  }
}

/**
 * 감사 로그 기록. 실패해도 던지지 않는다 — 호출부의 본 작업을 막지 않기 위해서다.
 * `await` 해도 되고 안 해도 되지만, 서버 액션에서는 응답 전에 끝나도록 await 하는 편이 안전하다.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actor.id,
        actorName: entry.actor.name,
        actorRole: entry.actor.role,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        summary: entry.summary.slice(0, 500),
        diff: entry.diff ? (entry.diff as never) : undefined,
        ipMasked: await maskedIp(),
      },
    });
  } catch (error) {
    // 감사 기록 실패는 운영자가 알아야 하지만, 사용자 요청을 실패시킬 사유는 아니다
    console.error('[audit] 기록 실패:', entry.action, error);
  }
}

/** 특정 대상의 이력 — 회원 상세·제재 상세에서 "이 건에 무슨 일이 있었나"를 보여 준다. */
export async function auditTrail(targetType: AuditTargetType, targetId: string, take = 20) {
  return prisma.auditLog
    .findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, actorName: true, actorRole: true, action: true, summary: true, createdAt: true },
    })
    .catch(() => []);
}

/** 행위자 표기 — "강*호(검토자)" */
export function actorLabel(name: string, role: string): string {
  return `${name}(${roleLabel(role)})`;
}
