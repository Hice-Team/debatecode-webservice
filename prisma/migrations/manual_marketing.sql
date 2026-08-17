-- 마케팅 수신 동의 명단 + 홍보 메일 발송 기록.
-- prisma db push가 P4002로 실패하는 환경이므로 db execute로 직접 적용한다:
--   npx prisma db execute --file prisma/migrations/manual_marketing.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "MarketingContact" (
  "id"               TEXT PRIMARY KEY,
  "email"            TEXT NOT NULL UNIQUE,
  "name"             TEXT,
  "userId"           UUID,
  "source"           TEXT NOT NULL DEFAULT 'signup',
  "consentedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unsubscribedAt"   TIMESTAMP(3),
  "unsubscribeToken" TEXT NOT NULL UNIQUE,
  "lastSentAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MarketingContact_unsub_consented_idx"
  ON "MarketingContact" ("unsubscribedAt", "consentedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmailCampaign" (
  "id"             TEXT PRIMARY KEY,
  "subject"        TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "audience"       TEXT NOT NULL DEFAULT 'all',
  "status"         TEXT NOT NULL DEFAULT 'draft',
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount"      INTEGER NOT NULL DEFAULT 0,
  "failedCount"    INTEGER NOT NULL DEFAULT 0,
  "errorMessage"   TEXT,
  "createdById"    UUID NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"         TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "EmailCampaign_status_created_idx"
  ON "EmailCampaign" ("status", "createdAt" DESC);

-- 이미 동의한 회원을 명단으로 옮긴다 (중복은 건너뛴다)
INSERT INTO "MarketingContact" ("id", "email", "name", "userId", "source", "consentedAt", "unsubscribeToken")
SELECT
  'mc_' || replace(u."id"::text, '-', ''),
  u."email",
  u."name",
  u."id",
  'signup',
  u."marketingConsentAt",
  encode(gen_random_bytes(16), 'hex')
FROM "User" u
WHERE u."marketingConsentAt" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;
