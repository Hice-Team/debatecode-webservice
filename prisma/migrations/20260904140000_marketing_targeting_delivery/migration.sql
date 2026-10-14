-- 홍보 메일: 대상 조건을 기록으로 남기고, 발송 결과를 수신자 단위로 남긴다.
--
-- 여태 캠페인에는 audience('all'|'members'|'guests') 한 칸뿐이었다. 그래서
-- "가입 폼으로 동의한 사람에게만" 같은 것을 고를 수 없었고, 보낸 뒤에는 성공·실패
-- 합계만 남아 실패한 3건이 누구였는지 답할 수 없었다.

-- ---------- 대상 조건 ----------
ALTER TABLE "EmailCampaign"
  ADD COLUMN IF NOT EXISTS "sourceFilter"          TEXT,
  ADD COLUMN IF NOT EXISTS "consentedWithinDays"   INTEGER,
  ADD COLUMN IF NOT EXISTS "excludeSentWithinDays" INTEGER;

COMMENT ON COLUMN "EmailCampaign"."sourceFilter" IS
  '동의 경로 필터. NULL이면 경로를 가리지 않는다.';
COMMENT ON COLUMN "EmailCampaign"."consentedWithinDays" IS
  '최근 N일 안에 동의한 사람만. NULL이면 기간 제한 없음.';
COMMENT ON COLUMN "EmailCampaign"."excludeSentWithinDays" IS
  '최근 N일 안에 이 서비스의 홍보 메일을 받은 사람은 제외. NULL이면 제외 없음.';

-- ---------- 수신자별 발송 결과 ----------
CREATE TABLE IF NOT EXISTS "EmailDelivery" (
  "id"         TEXT         NOT NULL,
  "campaignId" TEXT         NOT NULL,
  -- 명단에서 지워져도 발송 기록은 남아야 하므로 주소를 함께 박아 둔다
  "contactId"  TEXT,
  "email"      TEXT         NOT NULL,
  "status"     TEXT         NOT NULL, -- sent | failed
  "error"      TEXT,
  "attempt"    INTEGER      NOT NULL DEFAULT 1,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- 같은 캠페인에서 한 주소는 한 줄. 재발송은 새 줄이 아니라 이 줄을 갱신한다
-- (두 번 보냈는지 헷갈리지 않게).
CREATE UNIQUE INDEX IF NOT EXISTS "EmailDelivery_campaignId_email_key"
  ON "EmailDelivery" ("campaignId", "email");

-- 결과 화면은 항상 "이 캠페인의 실패분"을 찾는다
CREATE INDEX IF NOT EXISTS "EmailDelivery_campaignId_status_idx"
  ON "EmailDelivery" ("campaignId", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailDelivery_campaignId_fkey'
  ) THEN
    ALTER TABLE "EmailDelivery"
      ADD CONSTRAINT "EmailDelivery_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 이웃 표(EmailCampaign·MarketingContact)와 같은 설정: RLS는 켜 두고 정책은 두지
-- 않는다. 앱은 소유자 역할로 붙어 우회하고, PostgREST 경로는 전부 막힌다.
ALTER TABLE "EmailDelivery" ENABLE ROW LEVEL SECURITY;
