import { prisma } from '@/app/lib/prisma';
import { verifySession } from '@/app/lib/dal';
import Link from 'next/link';

export default async function LoginList({ searchParams }: { searchParams?: { q?: string; page?: string } }) {
  const { userId } = await verifySession();
  const q = searchParams?.q ?? '';
  const page = Math.max(1, Number(searchParams?.page ?? '1'));
  const pageSize = 20;

  const where: any = { userId };
  if (q) {
    where.OR = [{ userAgent: { contains: q } }, { ipMasked: { contains: q } }];
  }

  const [items, total] = await Promise.all([
    prisma.loginEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.loginEvent.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">로그인 기록</h2>
        <Link href="/settings" className="text-sm text-ink-soft/60">설정으로 돌아가기</Link>
      </div>
      <form className="mt-3 mb-4" action="/settings/security/logins">
        <input name="q" defaultValue={q} placeholder="검색 (브라우저, IP 등)" className="w-full rounded-lg border px-3 py-2" />
      </form>
      <div className="rounded-xl border border-ink/10 overflow-hidden">
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft/50">검색 결과가 없습니다.</p>
        ) : (
          items.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{e.userAgent ?? '알 수 없는 기기'}</p>
                <p className="font-mono text-[11px] text-ink-soft/50">IP {e.ipMasked}</p>
              </div>
              <div className="ml-auto font-mono text-[11px] text-ink-soft/50">{new Date(e.createdAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {Array.from({ length: totalPages }).map((_, i) => (
          <Link key={i} href={`/settings/security/logins?page=${i + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`px-3 py-1 rounded ${i + 1 === page ? 'bg-ink/10' : 'bg-white'}`}>
            {i + 1}
          </Link>
        ))}
      </div>
    </div>
  );
}
