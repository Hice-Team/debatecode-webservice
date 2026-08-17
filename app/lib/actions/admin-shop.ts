'use server';

// 디베이트샵 상품 관리 — 관리 콘솔 전용.
//
// 상품은 포인트가 실제로 빠져나가는 대상이라, 값을 받을 때 화면 검증만 믿지 않는다.
// 가격은 정수 포인트, 이미지는 http/https만(다른 스킴이 상점 카드의 img src로 들어가면 안 된다),
// 발급 채널은 카탈로그에 있는 값만 허용한다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getUser } from '../dal';
import { canManagePublishedContent } from '../roles';
import { SHOP_PROVIDERS } from '../shop';

export interface ShopAdminState {
  errors?: { form?: string[] };
  saved?: boolean;
  message?: string;
}

const PROVIDER_KEYS = SHOP_PROVIDERS.map((p) => p.key) as [string, ...string[]];

const productSchema = z.object({
  id: z.string().max(40).optional().or(z.literal('')),
  name: z.string().min(1, '상품명을 입력해 주세요.').max(80),
  brand: z.string().min(1, '브랜드를 입력해 주세요.').max(40),
  priceKrw: z.coerce
    .number()
    .int('가격은 정수여야 합니다.')
    .min(100, '가격은 100P 이상이어야 합니다.')
    .max(1_000_000, '가격이 너무 큽니다.'),
  imageUrl: z
    .string()
    .max(500)
    .refine((v) => !v || /^https?:\/\//i.test(v), 'http/https 이미지 주소만 사용할 수 있습니다.')
    .optional()
    .or(z.literal('')),
  provider: z.enum(PROVIDER_KEYS),
  providerSku: z.string().max(80).optional().or(z.literal('')),
  order: z.coerce.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});

/** 콘솔 권한 확인 — 상품은 공개 콘텐츠라 발행 권한과 같은 기준을 쓴다 */
async function requireManager() {
  const user = await getUser();
  if (!canManagePublishedContent(user.role)) throw new Error('forbidden');
  return user;
}

/** 상품 등록·수정 — id가 있으면 수정, 없으면 새로 만든다 */
export async function saveShopProduct(_prev: ShopAdminState, formData: FormData): Promise<ShopAdminState> {
  try {
    await requireManager();
  } catch {
    return { errors: { form: ['권한이 없습니다.'] } };
  }

  const parsed = productSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    brand: formData.get('brand'),
    priceKrw: formData.get('priceKrw'),
    imageUrl: formData.get('imageUrl'),
    provider: formData.get('provider'),
    providerSku: formData.get('providerSku'),
    order: formData.get('order') || 0,
    active: formData.get('active') === 'on',
  });
  if (!parsed.success) {
    return { errors: { form: parsed.error.issues.map((i) => i.message) } };
  }

  const { id, name, brand, priceKrw, imageUrl, provider, providerSku, order, active } = parsed.data;
  const data = {
    name,
    brand,
    priceKrw,
    imageUrl: imageUrl || null,
    provider,
    providerSku: providerSku || null,
    order: order ?? 0,
    active: !!active,
  };

  if (id) {
    await prisma.shopProduct.update({ where: { id }, data });
  } else {
    await prisma.shopProduct.create({ data });
  }

  revalidatePath('/console/shop');
  revalidatePath('/shop');
  return { saved: true, message: id ? '상품을 수정했습니다.' : '상품을 등록했습니다.' };
}

/** 판매 중지·재개 — 주문 이력이 남아 있으므로 삭제 대신 토글이 기본이다 */
export async function toggleShopProduct(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const product = await prisma.shopProduct.findUnique({ where: { id }, select: { active: true } });
  if (!product) return;

  await prisma.shopProduct.update({ where: { id }, data: { active: !product.active } });
  revalidatePath('/console/shop');
  revalidatePath('/shop');
}

/**
 * 상품 삭제 — 주문 이력이 하나라도 있으면 지우지 않는다.
 * 지우면 그 주문의 상품 정보가 사라져 이용자의 교환 내역이 깨진다. 그럴 때는 판매 중지를 쓴다.
 */
export async function deleteShopProduct(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const orderCount = await prisma.shopOrder.count({ where: { productId: id } });
  if (orderCount > 0) {
    await prisma.shopProduct.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.shopProduct.delete({ where: { id } });
  }

  revalidatePath('/console/shop');
  revalidatePath('/shop');
}
