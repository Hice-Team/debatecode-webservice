ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "starScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "rankBadgeVisible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "Workbook" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workbook_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "WorkbookItem" (
  "id" TEXT NOT NULL,
  "workbookId" TEXT NOT NULL,
  "problemId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkbookItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Workbook_userId_name_key" ON "Workbook"("userId", "name");
CREATE INDEX IF NOT EXISTS "Workbook_userId_isDefault_idx" ON "Workbook"("userId", "isDefault");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkbookItem_workbookId_problemId_key" ON "WorkbookItem"("workbookId", "problemId");
CREATE INDEX IF NOT EXISTS "WorkbookItem_problemId_idx" ON "WorkbookItem"("problemId");
ALTER TABLE "Workbook" ADD CONSTRAINT "Workbook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkbookItem" ADD CONSTRAINT "WorkbookItem_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkbookItem" ADD CONSTRAINT "WorkbookItem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
