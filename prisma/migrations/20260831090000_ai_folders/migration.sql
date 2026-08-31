-- AI Search 대화 폴더 — 사이드바에서 대화를 묶는다.
--
-- 전부 추가만 한다. 기존 대화는 folderId가 NULL인 채로 "최근" 목록에 그대로 남는다.
-- 폴더를 지워도 대화는 남는다(ON DELETE SET NULL) — 정리하려다 대화를 잃으면 안 된다.

CREATE TABLE IF NOT EXISTS "AiFolder" (
  "id"        TEXT NOT NULL,
  "userId"    UUID NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiFolder_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "AiFolder"
    ADD CONSTRAINT "AiFolder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AiFolder_userId_updatedAt_idx"
  ON "AiFolder" ("userId", "updatedAt" DESC);

ALTER TABLE "AiSession" ADD COLUMN IF NOT EXISTS "folderId" TEXT;

DO $$
BEGIN
  ALTER TABLE "AiSession"
    ADD CONSTRAINT "AiSession_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "AiFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AiSession_folderId_updatedAt_idx"
  ON "AiSession" ("folderId", "updatedAt" DESC);
