-- 코딩테스트 문제집 세트 라이브러리 (ProblemSet / ProblemSetItem)
CREATE TABLE IF NOT EXISTS "ProblemSet" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'exam',
  "description" TEXT NOT NULL,
  "company" TEXT,
  "examYear" TEXT,
  "difficulty" INTEGER NOT NULL DEFAULT 2,
  "timeLimitMin" INTEGER,
  "tags" JSONB NOT NULL DEFAULT '[]',
  "published" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProblemSet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProblemSet_slug_key" ON "ProblemSet"("slug");
CREATE INDEX IF NOT EXISTS "ProblemSet_published_kind_order_idx" ON "ProblemSet"("published", "kind", "order");

CREATE TABLE IF NOT EXISTS "ProblemSetItem" (
  "id" TEXT NOT NULL,
  "setId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProblemSetItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProblemSetItem_setId_problemId_key" ON "ProblemSetItem"("setId", "problemId");
CREATE INDEX IF NOT EXISTS "ProblemSetItem_problemId_idx" ON "ProblemSetItem"("problemId");

DO $$ BEGIN
  ALTER TABLE "ProblemSetItem" ADD CONSTRAINT "ProblemSetItem_setId_fkey"
    FOREIGN KEY ("setId") REFERENCES "ProblemSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProblemSetItem" ADD CONSTRAINT "ProblemSetItem_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public."ProblemSet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProblemSetItem" ENABLE ROW LEVEL SECURITY;

-- 디베이트메이트 신청서 PDF 첨부
ALTER TABLE "DebateMateApplication" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "DebateMateApplication" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
