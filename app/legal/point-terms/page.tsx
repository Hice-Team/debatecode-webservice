import type { Metadata } from 'next';
import Link from 'next/link';
import {
  POINT_AMOUNTS,
  POINT_KINDS,
  POINT_TO_KRW,
  SOLVE_POINTS_BY_DIFFICULTY,
} from '@/app/lib/points';
import { BOUNTY_MAX, BOUNTY_MIN } from '@/app/lib/board-rules';

export const metadata: Metadata = { title: '디베이트포인트 약관' };

// 포인트 약관을 따로 떼어 낸 이유.
//
// 예전에는 지급 기준이 디베이트메이트 활동 약관 제4조에 얹혀 있었다. 그런데 포인트는
// 이제 메이트 전용이 아니라 모든 회원이 문제를 풀며 쌓는 것이라, 메이트가 아닌 이용자는
// 자기에게 적용되는 규정을 남의 약관에서 찾아 읽어야 했다.
//
// 금액이 적힌 조항은 코드 상수에서 직접 읽어 온다. 정책을 바꿨는데 약관이 옛 숫자를
// 그대로 말하고 있으면, 그건 문구가 틀린 정도가 아니라 고지 의무를 어긴 것이 된다.
const SOLVE_ROWS = [
  { level: 1, label: '입문' },
  { level: 2, label: '기본' },
  { level: 3, label: '중급' },
  { level: 4, label: '고급' },
];

export default function PointTermsPage() {
  return (
    <>
      <h1>디베이트포인트 약관</h1>
      <p className="text-sm text-fg-muted">시행일: 2026년 8월 20일</p>

      <p>
        이 약관은 Debate Code(이하 &quot;서비스&quot;)가 운영하는 적립 제도인{' '}
        <strong>디베이트포인트</strong>(이하 &quot;포인트&quot;)의 지급·사용·소멸에 적용됩니다. 이 약관에 정하지 않은
        사항은 <Link href="/legal/terms">서비스 이용약관</Link>과{' '}
        <Link href="/legal/privacy">개인정보처리방침</Link>을 따르며, 디베이트메이트의 활동 조건은{' '}
        <Link href="/legal/mate-terms">디베이트메이트 활동 약관</Link>을 함께 봅니다.
      </p>

      <h2>제1조 (포인트의 성격)</h2>
      <ul>
        <li>
          포인트는 서비스가 이용자의 학습·기여 활동에 대해 <strong>무상으로 제공하는 적립 수단</strong>입니다. 이용자가
          대가를 지급하고 구매하는 선불전자지급수단이 아닙니다.
        </li>
        <li>
          포인트의 교환 가치는 <strong>{(1000 * POINT_TO_KRW).toLocaleString()}P = 1,000원 상당</strong>이며, 서비스 내
          디베이트샵의 상품 교환에만 사용할 수 있습니다.
        </li>
        <li>
          포인트는 <strong>현금으로 환급되지 않으며</strong>, 타인에게 양도·대여·판매하거나 계정 간 이전할 수 없습니다.
        </li>
        <li>이용자가 회원 탈퇴하면 보유 포인트는 즉시 소멸하며, 재가입하더라도 복구되지 않습니다.</li>
      </ul>

      <h2>제2조 (문제 풀이 지급)</h2>
      <p>
        문제 풀이 보상은 &quot;풀었는지&quot;가 아니라 <strong>얼마나 통과했는지</strong>에 비례합니다. 난이도별 만점
        기준은 다음과 같습니다.
      </p>
      <table>
        <thead>
          <tr>
            <th>난이도</th>
            <th>만점 지급</th>
          </tr>
        </thead>
        <tbody>
          {SOLVE_ROWS.map((row) => (
            <tr key={row.level}>
              <td>
                {row.level} ({row.label})
              </td>
              <td>{SOLVE_POINTS_BY_DIFFICULTY[row.level]}P</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        <li>
          모든 테스트케이스를 통과하면 위 만점이 지급됩니다. 일부만 통과한 경우에는{' '}
          <strong>만점 × 통과율 × 50%</strong>를 지급합니다(소수점 이하 버림).
        </li>
        <li>
          부분 통과에도 지급하는 것은 어려운 문제에 도전한 시도가 헛되지 않게 하기 위함이며, 절반으로 낮춘 것은 일부러
          낮은 통과로 반복 제출하는 방식이 이득이 되지 않게 하기 위함입니다.
        </li>
        <li>
          <strong>같은 문제에 대한 지급은 1회로 제한</strong>됩니다. 이미 지급받은 문제를 다시 풀어도 추가 지급되지
          않습니다.
        </li>
      </ul>

      <h2>제3조 (기여 활동 지급)</h2>
      <p>
        기여 활동은 <strong>검토·채택이 완료된 시점</strong>에만 지급됩니다. 신청·작성만으로는 지급되지 않으며, 심사
        대기 중인 활동은 &quot;적립 예정&quot;으로만 표시되고 사용 가능 잔액에 포함되지 않습니다.
      </p>
      <table>
        <thead>
          <tr>
            <th>활동</th>
            <th>지급</th>
            <th>지급 시점</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>문제 출제 승인</td>
            <td>{POINT_AMOUNTS[POINT_KINDS.problemApproved]}P</td>
            <td>운영진 검토 승인 시</td>
          </tr>
          <tr>
            <td>멘토게시판 답변 채택</td>
            <td>{POINT_AMOUNTS[POINT_KINDS.mentorAdopted]}P</td>
            <td>질문자가 채택한 시점</td>
          </tr>
          <tr>
            <td>문의게시판 답변 채택</td>
            <td>
              {BOUNTY_MIN}~{BOUNTY_MAX}P (질문자 지정)
            </td>
            <td>질문자가 채택한 시점</td>
          </tr>
          <tr>
            <td>SNS 홍보 인증 승인</td>
            <td>{POINT_AMOUNTS[POINT_KINDS.snsApproved]}P</td>
            <td>운영진 인증 승인 시</td>
          </tr>
          <tr>
            <td>우수 기여 보너스</td>
            <td>30~50P</td>
            <td>운영진 재량</td>
          </tr>
        </tbody>
      </table>

      <h2>제4조 (문의게시판 채택 포인트)</h2>
      <ul>
        <li>
          질문자는 문의글을 작성할 때 채택 포인트를 <strong>{BOUNTY_MIN}P 이상 {BOUNTY_MAX}P 이하</strong>에서 직접
          정합니다. 지정하지 않으면 기본값이 적용됩니다.
        </li>
        <li>
          채택 포인트는 <strong>질문자의 잔액에서 차감되지 않습니다.</strong> 서비스가 지급하는 보상이며, 질문자가
          부담하는 금액이 아닙니다.
        </li>
        <li>답변을 채택하면 해당 글에는 더 이상 답글을 달 수 없으며, 채택은 취소할 수 없습니다.</li>
        <li>질문자는 자신의 답글을 채택할 수 없습니다.</li>
      </ul>

      <h2>제5조 (디베이트메이트 관련 지급 정책)</h2>
      <p>
        문의게시판과 멘토게시판의 답변 채택 보상은 <strong>디베이트메이트에게만 지급</strong>됩니다. 답변 자격과 지급
        대상이 일치하지 않는다는 점에 유의해 주십시오.
      </p>
      <table>
        <thead>
          <tr>
            <th>역할</th>
            <th>문의게시판 답변</th>
            <th>채택 시 포인트</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>디베이트메이트</td>
            <td>가능</td>
            <td>
              <strong>지급</strong>
            </td>
          </tr>
          <tr>
            <td>운영진(관리자)</td>
            <td>가능</td>
            <td>지급하지 않음</td>
          </tr>
          <tr>
            <td>협력사 직원</td>
            <td>가능</td>
            <td>지급하지 않음</td>
          </tr>
          <tr>
            <td>일반 회원</td>
            <td>불가</td>
            <td>해당 없음</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>
          운영진에게 지급하지 않는 이유는 답변이 운영 업무의 일부이기 때문입니다. 운영진이 스스로 답하고 스스로 보상을
          받는 구조가 되면 적립 원장의 신뢰가 무너집니다.
        </li>
        <li>협력사 직원의 답변은 제휴 관계에 따른 것이므로 포인트 지급 대상이 아닙니다.</li>
        <li>
          지급 대상이 아닌 역할이 채택되더라도 <strong>채택 자체는 정상적으로 처리</strong>되며, 포인트만 적립되지
          않습니다.
        </li>
        <li>
          디베이트메이트가 자격을 상실한 경우, 상실 이전에 적립된 포인트는 그대로 유지되며 이후 활동에는 지급되지
          않습니다.
        </li>
      </ul>

      <h2>제6조 (사용 방식)</h2>
      <ul>
        <li>포인트는 <Link href="/shop">디베이트샵</Link>의 상품 교환에만 사용할 수 있습니다.</li>
        <li>주문 시 포인트가 <strong>즉시 차감</strong>되며 주문은 &quot;발급 대기&quot; 상태가 됩니다.</li>
        <li>발급 전에는 이용자가 직접 주문을 취소할 수 있고, 차감된 포인트는 전액 환불됩니다.</li>
        <li>재고 소진·발급 오류로 발급이 불가한 경우 운영진이 실패 처리하며 포인트는 자동 환불됩니다.</li>
        <li>발급이 완료된 쿠폰은 취소·환불되지 않으며, 사용 조건과 유효기간은 각 브랜드의 정책을 따릅니다.</li>
        <li>보유 잔액을 초과하는 주문은 접수되지 않습니다.</li>
      </ul>

      <h2>제7조 (적립 내역의 확인)</h2>
      <p>
        모든 적립과 사용은 원장에 건별로 기록되며, 이용자는{' '}
        <Link href="/dashboard">대시보드</Link>에서 언제든 확인할 수 있습니다. 잔액은 별도로 저장하지 않고 원장 합계로
        계산하므로, 내역과 잔액이 어긋나는 일은 발생하지 않습니다.
      </p>

      <h2>제8조 (부정 적립의 취소)</h2>
      <p>
        다음의 경우 운영진은 적립된 포인트를 회수하거나 지급을 거절할 수 있으며, 사안이 중대한 경우 서비스 이용약관에
        따라 계정을 제재할 수 있습니다.
      </p>
      <ul>
        <li>동일하거나 실질적으로 같은 콘텐츠를 반복 게시해 지급을 신청한 경우</li>
        <li>단순 복사·붙여넣기 게시물, 서비스와 무관한 게시물로 홍보 인증을 신청한 경우</li>
        <li>타인의 계정을 이용하거나 계정을 나눠 부정하게 채택·승인을 유도한 경우</li>
        <li>자동화 도구로 제출을 반복해 문제 풀이 보상을 취득한 경우</li>
        <li>출제한 문제에 표절이나 중대한 오류가 확인된 경우</li>
      </ul>
      <p>
        회수 시에는 사유를 계정에 통지하며, 이용자는 <Link href="/community?board=qna">문의게시판</Link>을 통해 이의를
        제기할 수 있습니다. 부정행위가 확인된 계정은 명예의 전당 순위가 별도로 초기화될 수 있습니다.
      </p>

      <h2>제9조 (지급 기준의 변경)</h2>
      <ul>
        <li>운영자는 지급 기준·상품 구성·필요 포인트를 변경할 수 있습니다.</li>
        <li>
          이용자에게 <strong>불리한 변경</strong>(지급액 인하, 지급 대상 축소, 사용처 제한 등)은 시행일{' '}
          <strong>7일 전까지</strong> 서비스 내 공지로 안내합니다.
        </li>
        <li>이미 적립된 포인트는 변경 전 기준에 따라 그대로 사용할 수 있습니다.</li>
        <li>서비스 종료 시에는 종료일 30일 전까지 공지하며, 그 기간 동안 보유 포인트를 사용할 수 있도록 합니다.</li>
      </ul>

      <p className="mt-8 text-sm text-fg-muted">
        문의: <Link href="/community?board=qna">문의게시판</Link>
      </p>
    </>
  );
}
