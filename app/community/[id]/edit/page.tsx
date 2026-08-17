import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { verifySession } from '@/app/lib/dal';
import EditForm from './edit-form';

export const metadata: Metadata = { title: '글 수정' };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await verifySession();

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      authorId: true,
      board: true,
      attachments: { orderBy: { order: 'asc' }, select: { id: true, kind: true, url: true, label: true } },
    },
  });
  if (!post) notFound();
  if (post.authorId !== userId) redirect(`/community/${id}`);

  return (
    <PageShell width="4xl">
      <BackButton label="글로 돌아가기" className="mb-4" />
      <PageHeader slug="edit-post" title="글 수정" className="mb-6" />
      <EditForm
        postId={post.id}
        initialTitle={post.title}
        initialContent={post.content}
        attachments={post.attachments}
      />
    </PageShell>
  );
}
