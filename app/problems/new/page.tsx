import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import EditorUnavailable from '@/app/components/editor-unavailable';
import { canUseEditor, getDeviceClass } from '@/app/lib/device';
import { getUser } from '@/app/lib/dal';
import ProblemEditor from './problem-editor';

export const metadata: Metadata = { title: '문제 등록' };

// 관리자 전용 문제 에디터 — 일반 사용자는 문제집으로 돌려보낸다.
export default async function NewProblemPage() {
  // 출제 에디터도 스마트폰에서는 조작이 되지 않는다 — 풀이 에디터와 같은 기준으로 막는다
  if (!canUseEditor(await getDeviceClass())) {
    return <EditorUnavailable title="문제 등록은 스마트폰에서 할 수 없습니다" />;
  }

  const user = await getUser();
  if (user.role !== 'admin') redirect('/problems');

  return (
    <PageShell width="4xl">
      <BackButton label="문제집으로 돌아가기" className="mb-4" />
      <PageHeader
        slug="problem-editor"
        title="문제 등록"
        desc="마크다운 설명, 언어별 시작 코드, 테스트케이스, 면접 평가 키워드를 입력해 새 문제를 만듭니다."
        className="mt-4 mb-8"
      />
      <div className="dc-card p-8">
        <ProblemEditor />
      </div>
    </PageShell>
  );
}
