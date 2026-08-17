-- AI Search 대화 세션 / 메시지
CREATE TABLE IF NOT EXISTS "AiSession" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "title" TEXT,
  "importedFrom" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiSession_userId_updatedAt_idx" ON "AiSession"("userId", "updatedAt" DESC);
DO $$ BEGIN
  ALTER TABLE "AiSession" ADD CONSTRAINT "AiSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."AiSession" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "AiMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "attachments" JSONB NOT NULL DEFAULT '[]',
  "sources" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiMessage_sessionId_createdAt_idx" ON "AiMessage"("sessionId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AiSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."AiMessage" ENABLE ROW LEVEL SECURITY;
