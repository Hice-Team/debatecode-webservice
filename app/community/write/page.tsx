import type { Metadata } from 'next';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { verifySession } from '@/app/lib/dal';
import { isBoardKey } from '../boards';
import WriteForm from './write-form';

export const metadata: Metadata = { title: '글쓰기' };

export default async function WritePage({ searchParams }: PageProps<'/community/write'>) {
  await verifySession();
  const { board } = await searchParams;
  const initialBoard = isBoardKey(typeof board === 'string' ? board : undefined)
    ? (board as string)
    : 'free';

  // 폼이 편집기 / 설정 두 단으로 나뉘므로 셸도 넓게 쓴다(좁은 화면에서는 다시 한 단으로 쌓인다)
  return (
    <PageShell width="6xl">
      <BackButton label="커뮤니티로 돌아가기" className="mb-4" />
      <PageHeader slug="new-post" title="글쓰기" className="mb-6" />
      <WriteForm initialBoard={initialBoard} />
    </PageShell>
  );
}
