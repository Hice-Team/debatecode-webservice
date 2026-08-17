-- Free Tier 모델별 사용량 내역 컬럼.
-- prisma db push가 P4002로 실패하는 환경이므로 db execute로 직접 적용한다:
--   npx prisma db execute --file prisma/migrations/manual_free_usage_by_model.sql --schema prisma/schema.prisma
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeUsageByModel" JSONB;
