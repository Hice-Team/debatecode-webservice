import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canManagePublishedContent } from '@/app/lib/roles';
import { POINT_TO_KRW_NOTE } from '@/app/lib/shop';
import { PageHeader } from '../ui';
import ProductManager, { type ManagedProduct } from './product-manager';

export const metadata: Metadata = { title: '디베이트샵 상품' };

export default async function ConsoleShopPage() {
  const user = await getUser();
  if (!canManagePublishedContent(user.role)) redirect('/console');

  const rows = await prisma.shopProduct.findMany({
    orderBy: [{ active: 'desc' }, { order: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      brand: true,
      priceKrw: true,
      imageUrl: true,
      provider: true,
      providerSku: true,
      order: true,
      active: true,
      _count: { select: { orders: true } },
    },
  });

  const products: ManagedProduct[] = rows.map(({ _count, ...product }) => ({
    ...product,
    orderCount: _count.orders,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Shop"
        title="디베이트샵 상품"
        sub={`상점에 진열할 기프티콘을 등록하고 노출 여부를 관리합니다. ${POINT_TO_KRW_NOTE}`}
      />
      <ProductManager products={products} />
    </>
  );
}
