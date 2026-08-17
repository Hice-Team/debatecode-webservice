// 디베이트샵 초기 상품 — 1,000P = 1,000원.
// provider는 실제 발급 채널이 붙기 전까지 manual(운영자 수동 발급)로 둔다.
// 실행: npx tsx prisma/seed-shop.ts
import { PrismaClient } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const PRODUCTS = [
  { name: '아메리카노 (T)', brand: '스타벅스', priceKrw: 4500, order: 1 },
  { name: '카페라떼 (T)', brand: '투썸플레이스', priceKrw: 5000, order: 2 },
  { name: '아이스크림 파인트', brand: '배스킨라빈스', priceKrw: 9500, order: 3 },
  { name: '모바일 금액권 5천원', brand: 'GS25', priceKrw: 5000, order: 4 },
  { name: '모바일 금액권 1만원', brand: 'CU', priceKrw: 10000, order: 5 },
  { name: '치킨 세트 교환권', brand: 'BBQ', priceKrw: 20000, order: 6 },
];

async function main() {
  let created = 0;
  for (const product of PRODUCTS) {
    const exists = await prisma.shopProduct.findFirst({
      where: { brand: product.brand, name: product.name },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.shopProduct.create({ data: { ...product, provider: 'manual', active: true } });
    created += 1;
  }
  const total = await prisma.shopProduct.count();
  console.log(`새로 추가한 상품: ${created}개 / 전체: ${total}개`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
