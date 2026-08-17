-- 디베이트메이트 포인트 원장
CREATE TABLE IF NOT EXISTS "PointLedger" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "memo" TEXT,
  "refType" TEXT,
  "refId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PointLedger_userId_createdAt_idx" ON "PointLedger"("userId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "PointLedger_userId_kind_refType_refId_key"
  ON "PointLedger"("userId", "kind", "refType", "refId");
DO $$ BEGIN
  ALTER TABLE "PointLedger" ADD CONSTRAINT "PointLedger_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."PointLedger" ENABLE ROW LEVEL SECURITY;

-- 활동 인증 신청
CREATE TABLE IF NOT EXISTS "PointRequest" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "amount" INTEGER NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "proofUrl" TEXT,
  "reviewNote" TEXT,
  "reviewedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "PointRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PointRequest_status_createdAt_idx" ON "PointRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PointRequest_userId_createdAt_idx" ON "PointRequest"("userId", "createdAt" DESC);
DO $$ BEGIN
  ALTER TABLE "PointRequest" ADD CONSTRAINT "PointRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."PointRequest" ENABLE ROW LEVEL SECURITY;

-- 디베이트샵 상품
CREATE TABLE IF NOT EXISTS "ShopProduct" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "priceKrw" INTEGER NOT NULL,
  "imageUrl" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'manual',
  "providerSku" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopProduct_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShopProduct_active_order_idx" ON "ShopProduct"("active", "order");
ALTER TABLE public."ShopProduct" ENABLE ROW LEVEL SECURITY;

-- 상점 주문
CREATE TABLE IF NOT EXISTS "ShopOrder" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "productId" TEXT NOT NULL,
  "pointsSpent" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "couponCode" TEXT,
  "couponExpiresAt" TIMESTAMP(3),
  "providerOrderId" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fulfilledAt" TIMESTAMP(3),
  CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShopOrder_userId_createdAt_idx" ON "ShopOrder"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ShopOrder_status_createdAt_idx" ON "ShopOrder"("status", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "ShopProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."ShopOrder" ENABLE ROW LEVEL SECURITY;
