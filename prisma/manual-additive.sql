-- 순수 추가(ADD COLUMN / CREATE TABLE)만 수행하는 수동 마이그레이션.
-- `prisma db push`는 public.User -> auth.users FK(트리거로 생성됨) 때문에
-- 스키마 전체를 재구성하려다 auth 스키마 테이블(users/identities 등) 삭제를 시도하므로 사용하지 않는다.
-- 이 스크립트는 오직 새 컬럼/새 테이블만 만들고 기존 어떤 것도 삭제하지 않는다.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiOnboarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "url" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "snsPlatform" TEXT;

CREATE TABLE IF NOT EXISTS "Bookmark" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "problemId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),
  CONSTRAINT "Bookmark_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Bookmark_userId_problemId_key" ON "Bookmark"("userId", "problemId");

CREATE TABLE IF NOT EXISTS "Course" (
  "id" SERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "Lesson" (
  "id" SERIAL PRIMARY KEY,
  "courseId" INTEGER NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Lesson_courseId_slug_key" ON "Lesson"("courseId", "slug");

CREATE TABLE IF NOT EXISTS "LessonProgress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "lessonId" INTEGER NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),
  CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- 설정 대시보드: 프로필/앱 설정
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailNotifications" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredLanguage" TEXT;

-- 커뮤니티 댓글/답글
CREATE TABLE IF NOT EXISTS "Comment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "authorId" UUID NOT NULL,
  "parentId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE,
  CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id"),
  CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE
);

-- 커뮤니티 첨부파일 (파일/이미지/유튜브/링크/코드)
CREATE TABLE IF NOT EXISTS "Attachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT,
  "label" TEXT,
  "content" TEXT,
  "language" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE
);

-- 커뮤니티 첨부파일용 공개 Storage 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-uploads', 'community-uploads', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 인증된 사용자는 업로드 가능, 누구나 읽기 가능
DROP POLICY IF EXISTS "community-uploads read" ON storage.objects;
CREATE POLICY "community-uploads read" ON storage.objects FOR SELECT
  USING (bucket_id = 'community-uploads');
DROP POLICY IF EXISTS "community-uploads insert" ON storage.objects;
CREATE POLICY "community-uploads insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'community-uploads' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "avatars read" ON storage.objects;
CREATE POLICY "avatars read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars insert" ON storage.objects;
CREATE POLICY "avatars insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "avatars update" ON storage.objects;
CREATE POLICY "avatars update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- 커뮤니티 완성: 좋아요/조회수/수정시각, 기출 연도, 인덱스
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
ALTER TABLE "Problem" ADD COLUMN IF NOT EXISTS "examYear" TEXT;

CREATE TABLE IF NOT EXISTS "PostLike" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE,
  CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");
CREATE INDEX IF NOT EXISTS "PostLike_postId_idx" ON "PostLike"("postId");

CREATE INDEX IF NOT EXISTS "Post_board_createdAt_idx" ON "Post"("board", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Comment_postId_idx" ON "Comment"("postId");
CREATE INDEX IF NOT EXISTS "Attachment_postId_idx" ON "Attachment"("postId");
CREATE INDEX IF NOT EXISTS "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt" DESC);

-- 기출 연도 백필 (기존 하드코딩 YEAR_BY_COMPANY 매핑)
UPDATE "Problem" SET "examYear" = '2024' WHERE "company" = '카카오' AND "examYear" IS NULL;
UPDATE "Problem" SET "examYear" = '2024' WHERE "company" = '네이버' AND "examYear" IS NULL;
UPDATE "Problem" SET "examYear" = '2023' WHERE "company" = '토스' AND "examYear" IS NULL;
UPDATE "Problem" SET "examYear" = '2024' WHERE "company" IS NOT NULL AND "examYear" IS NULL;

-- ============================================================================
-- 보안: 앱 테이블 RLS 활성화 (2026-07)
-- 앱의 모든 데이터 접근은 Prisma(테이블 owner=postgres, RLS 우회)를 통하고,
-- 클라이언트 Supabase는 Auth·Storage에만 사용한다. 따라서 정책 없이 RLS만 켜면
-- 공개 anon 키의 PostgREST 직접 접근(전체 이메일·제출·면접 데이터 유출)이 차단되고
-- 앱 동작에는 영향이 없다. (익명/authenticated 역할 = 전 테이블 deny-all)
-- 적용:  psql "$DIRECT_URL" -f prisma/manual-additive.sql   또는 Supabase SQL Editor
-- ============================================================================
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Problem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Bookmark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TestCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InterviewSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PostLike" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Lesson" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LessonProgress" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2026-07-10: 다단계 가입 위저드 프로필 필드
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthdate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "position" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "major" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "interests" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralSource" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileCompleted" BOOLEAN NOT NULL DEFAULT false;

-- 새 위저드 도입 이전에 가입한 계정은 완료 처리 (위저드로 강제 진입 방지)
UPDATE "User" SET "profileCompleted" = true WHERE "consentAt" IS NOT NULL;

-- PayApp 후원 기능 제거 — 테이블이 존재하면 정리
DROP TABLE IF EXISTS "Donation";

-- ============================================================================
-- 2026-07-11: 커뮤니티 투표 기능 (Attachment.kind='poll' + PollVote)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "PollVote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "attachmentId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "optionIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollVote_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE,
  CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_attachmentId_userId_key" ON "PollVote"("attachmentId", "userId");
ALTER TABLE public."PollVote" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2026-07-11b: 사용자 제재 + 전체 공지 팝업
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)
);
ALTER TABLE public."Announcement" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2026-07-14: MCP/debateBridge 연동 토큰(User) + IP 보안 로그인 기록(LoginEvent)
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mcpTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mcpTokenPrefix" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mcpTokenCreatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_mcpTokenHash_key" ON "User"("mcpTokenHash");

CREATE TABLE IF NOT EXISTS "LoginEvent" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "ipHash" TEXT NOT NULL,
  "ipMasked" TEXT NOT NULL,
  "userAgent" TEXT,
  "isNew" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");
ALTER TABLE public."LoginEvent" ENABLE ROW LEVEL SECURITY;

-- 개인정보 암호화 저장: birthdate를 DateTime→TEXT로 변경(암호문 저장). 기존 값은 텍스트로 캐스팅.
ALTER TABLE "User" ALTER COLUMN "birthdate" TYPE TEXT USING "birthdate"::text;

-- ============================================================================
-- 2026-07-14b: 운영 콘솔 — 신고/문의/제재이력/문제검토큐/디베이트메이트 신청
-- ============================================================================
CREATE TABLE IF NOT EXISTS "Report" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reporterId" UUID NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "detail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "handledById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
ALTER TABLE public."Report" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "Inquiry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID,
  "email" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "answer" TEXT,
  "answeredById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "Inquiry_status_createdAt_idx" ON "Inquiry"("status", "createdAt");
ALTER TABLE public."Inquiry" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "Sanction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "issuedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sanction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Sanction_userId_active_idx" ON "Sanction"("userId", "active");
ALTER TABLE public."Sanction" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ProblemDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "authorId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "difficulty" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewNote" TEXT,
  "reviewedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "ProblemDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id")
);
CREATE INDEX IF NOT EXISTS "ProblemDraft_status_createdAt_idx" ON "ProblemDraft"("status", "createdAt");
ALTER TABLE public."ProblemDraft" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "DebateMateApplication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "motivation" TEXT NOT NULL,
  "portfolioUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "DebateMateApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DebateMateApplication_userId_key" ON "DebateMateApplication"("userId");
ALTER TABLE public."DebateMateApplication" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2026-07-16: debateQ 모드 (디베이트메이트 전용 — AI 결함 코드 수정·변론)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "DebateQSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "problemId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "round" INTEGER NOT NULL DEFAULT 1,
  "language" TEXT NOT NULL,
  "initialCode" TEXT NOT NULL,
  "currentCode" TEXT NOT NULL,
  "flawHints" JSONB NOT NULL DEFAULT '[]',
  "messages" JSONB NOT NULL DEFAULT '[]',
  "report" JSONB,
  "score" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DebateQSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "DebateQSession_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
);
CREATE INDEX IF NOT EXISTS "DebateQSession_userId_createdAt_idx" ON "DebateQSession"("userId", "createdAt" DESC);
ALTER TABLE public."DebateQSession" ENABLE ROW LEVEL SECURITY;

-- debateQ 사전사용 허용 플래그 (메이트가 아니어도 이용 가능)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "debateQAccess" BOOLEAN NOT NULL DEFAULT false;

-- 문제 초안 저작권 기증 위임서 (JSON, null=저작권 보유)
ALTER TABLE "ProblemDraft" ADD COLUMN IF NOT EXISTS "copyrightDelegation" JSONB;

-- ============================================================================
-- 2026-07-18: 워크스페이스 시도횟수 탭 — 실행/제출 코드 기록 (RunAttempt)
-- ============================================================================
CREATE TABLE IF NOT EXISTS "RunAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "problemId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "passedCount" INTEGER NOT NULL,
  "totalCount" INTEGER NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'run',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "RunAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id")
);
CREATE INDEX IF NOT EXISTS "RunAttempt_userId_problemId_createdAt_idx" ON "RunAttempt"("userId", "problemId", "createdAt" DESC);
ALTER TABLE public."RunAttempt" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2026-07-19: 디베이트메이트 관리 — 반려서/회수 사유 컬럼
-- ============================================================================
ALTER TABLE "DebateMateApplication" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

-- ============================================================================
-- 2026-07-19b: Debate Free AI 일일 토큰 쿠터 (하루 10만 토큰, 소진 시 규칙 기반 전환)
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeTokensUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "freeTokensResetAt" TIMESTAMP(3);

-- ============================================================================
-- 2026-08-09: 코딩테스트 문제집 세트 라이브러리 + 메이트 신청서 첨부
-- ============================================================================
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

-- ============================================================================
-- 2026-08-10: 커뮤니티 익명 식별자 + 게시판 규칙(비밀글/채택/인증 답변)
-- ============================================================================
-- 익명 식별자 + 등급 배지 노출 정책
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "anonymousTag" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_anonymousTag_key" ON "User"("anonymousTag");

-- 게시판 규칙: 익명글 / 비밀글 / 인증 답변 전용 / 답변 채택
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "anonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "secret" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "verifiedOnlyReplies" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "adoptedCommentId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "adoptedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Post_adoptedCommentId_key" ON "Post"("adoptedCommentId");

ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "anonymous" BOOLEAN NOT NULL DEFAULT false;

-- 기존 문의게시판 글은 비밀글 정책 대상이므로 소급 적용한다
UPDATE "Post" SET "secret" = true WHERE "board" = 'qna' AND "secret" = false;

-- 기존 사용자 익명 식별자 백필 — Anonymous + 2~4자리 난수. 충돌 시 남은 행은 다음 실행에서 채워진다.
UPDATE "User"
SET "anonymousTag" = 'Anonymous ' || (10 + floor(random() * 9990))::int
WHERE "anonymousTag" IS NULL;

-- ============================================================================
-- 2026-08-10b: 디베이트메이트 포인트 원장 / 활동 인증 / 디베이트샵
-- ============================================================================
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

-- ============================================================================
-- 2026-08-10c: AI Search 대화 세션 / 메시지
-- ============================================================================
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

-- ============================================================================
-- 2026-08-10d: debateAI 이용약관 동의 / 학습 활용 동의(선택)
-- ============================================================================
-- debateAI 이용약관 동의 / 학습 활용 동의(선택)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiTermsAgreedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiTrainingConsentAt" TIMESTAMP(3);

-- 2026-08-10e: AI Search 모델 선택 기록
-- AI Search 모델 선택 기록
ALTER TABLE "AiSession" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "AiMessage" ADD COLUMN IF NOT EXISTS "model" TEXT;

-- ============================================================================
-- 2026-08-18: 운영 콘솔 기반 — 런타임 설정 / 감사 로그 / 권한 오버라이드 / 매크로
--             + 신고·문의·제재 트리아지 컬럼
-- (Supabase 프로젝트 gymgvibkcjokaohmmxkt에 적용 완료)
-- ============================================================================

-- 런타임 설정 — 기본값에서 벗어난 값만 들어온다. 비어 있어도 앱은 코드 기본값으로 동작한다.
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "key"         TEXT PRIMARY KEY,
  "value"       JSONB NOT NULL,
  "category"    TEXT NOT NULL,
  "updatedById" UUID,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AppSetting_category_idx" ON "AppSetting"("category");
ALTER TABLE public."AppSetting" ENABLE ROW LEVEL SECURITY;

-- 감사 로그 — 행위자 이름/역할은 스냅샷(계정이 지워져도 이력이 남게)
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         TEXT PRIMARY KEY,
  "actorId"    UUID,
  "actorName"  TEXT NOT NULL,
  "actorRole"  TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "targetType" TEXT,
  "targetId"   TEXT,
  "summary"    TEXT NOT NULL,
  "diff"       JSONB,
  "ipMasked"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

-- 개별 권한 오버라이드 — deny가 allow보다 세다
CREATE TABLE IF NOT EXISTS "PermissionGrant" (
  "id"          TEXT PRIMARY KEY,
  "userId"      UUID NOT NULL,
  "permission"  TEXT NOT NULL,
  "effect"      TEXT NOT NULL DEFAULT 'allow',
  "reason"      TEXT,
  "expiresAt"   TIMESTAMP(3),
  "grantedById" UUID,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissionGrant_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PermissionGrant_userId_permission_key" ON "PermissionGrant"("userId", "permission");
CREATE INDEX IF NOT EXISTS "PermissionGrant_userId_idx" ON "PermissionGrant"("userId");
ALTER TABLE public."PermissionGrant" ENABLE ROW LEVEL SECURITY;

-- 매크로(정형 답변)
CREATE TABLE IF NOT EXISTS "CannedResponse" (
  "id"        TEXT PRIMARY KEY,
  "scope"     TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CannedResponse_scope_active_order_idx" ON "CannedResponse"("scope", "active", "order");
ALTER TABLE public."CannedResponse" ENABLE ROW LEVEL SECURITY;

-- 신고 트리아지
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "assigneeId"   UUID;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "priority"     TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "internalNote" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "actionTaken"  TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "dedupeKey"    TEXT;
CREATE INDEX IF NOT EXISTS "Report_dedupeKey_status_idx" ON "Report"("dedupeKey", "status");
CREATE INDEX IF NOT EXISTS "Report_assigneeId_status_idx" ON "Report"("assigneeId", "status");
UPDATE "Report" SET "dedupeKey" = "targetType" || ':' || "targetId" WHERE "dedupeKey" IS NULL;

-- 문의 트리아지
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "assigneeId"      UUID;
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "category"        TEXT;
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "priority"        TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "firstResponseAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Inquiry_assigneeId_status_idx" ON "Inquiry"("assigneeId", "status");
UPDATE "Inquiry" SET "firstResponseAt" = "answeredAt" WHERE "firstResponseAt" IS NULL AND "answeredAt" IS NOT NULL;

-- 제재 근거 / 이의제기 / 해제 기록
ALTER TABLE "Sanction" ADD COLUMN IF NOT EXISTS "evidence"     JSONB;
ALTER TABLE "Sanction" ADD COLUMN IF NOT EXISTS "appealText"   TEXT;
ALTER TABLE "Sanction" ADD COLUMN IF NOT EXISTS "appealedAt"   TIMESTAMP(3);
ALTER TABLE "Sanction" ADD COLUMN IF NOT EXISTS "appealStatus" TEXT;
ALTER TABLE "Sanction" ADD COLUMN IF NOT EXISTS "liftedById"   UUID;
ALTER TABLE "Sanction" ADD COLUMN IF NOT EXISTS "liftedAt"     TIMESTAMP(3);
ALTER TABLE "Sanction" ADD COLUMN IF NOT EXISTS "liftReason"   TEXT;
CREATE INDEX IF NOT EXISTS "Sanction_active_expiresAt_idx" ON "Sanction"("active", "expiresAt");
CREATE INDEX IF NOT EXISTS "Sanction_appealStatus_idx" ON "Sanction"("appealStatus");

-- 2026-08-18b: 배포 전 점검 — RLS가 빠져 있던 표 4개
-- anon 키로 PostgREST를 통해 읽기/쓰기가 가능한 상태였다(DebateAiChat·LaunchNotify는 개인정보).
-- 앱은 전부 Prisma(서버)로만 접근하므로 정책 없이 RLS만 켠다.
ALTER TABLE public."Workbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WorkbookItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DebateAiChat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LaunchNotify" ENABLE ROW LEVEL SECURITY;

-- 2026-08-18c: 스키마에는 있는데 DB에 만들어진 적 없던 표 4개
-- BackupCode/WebauthnKey(2차 보안), MarketingContact/EmailCampaign(홍보 메일).
-- 이 표들이 없어서 해당 기능이 런타임에 전부 실패하고 있었다. 정의는 schema.prisma 참조.
-- (실제 DDL은 Supabase 마이그레이션 create_missing_schema_tables 로 적용됨)

-- 2026-08-20: AI Search 답변 피드백 (👍/👎 + 사유)
-- 예전에는 버튼 상태가 화면에만 남고 아무 데도 저장되지 않았다.
CREATE TABLE IF NOT EXISTS "AiFeedback" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "userId"    UUID NOT NULL,
  "rating"    TEXT NOT NULL,
  "reasons"   JSONB NOT NULL DEFAULT '[]',
  "comment"   TEXT,
  "model"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiMessage"("id") ON DELETE CASCADE,
  CONSTRAINT "AiFeedback_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")      ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiFeedback_messageId_userId_key" ON "AiFeedback"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "AiFeedback_rating_createdAt_idx" ON "AiFeedback"("rating", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AiFeedback_createdAt_idx" ON "AiFeedback"("createdAt" DESC);
-- 앱은 Prisma(서버)로만 접근한다 — anon 키로 뚫리지 않도록 RLS만 켠다.
ALTER TABLE public."AiFeedback" ENABLE ROW LEVEL SECURITY;

-- 2026-08-20b: AI Search 대화 분기 — 원본 대화 정보
ALTER TABLE "AiSession" ADD COLUMN IF NOT EXISTS "branchedFrom" JSONB;

-- 2026-08-20c: 개인 랭킹 초기화 기록
CREATE TABLE IF NOT EXISTS "RankingReset" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "userId"    UUID NOT NULL,
  "resetAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason"    TEXT NOT NULL,
  "byId"      UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RankingReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "RankingReset_userId_resetAt_idx" ON "RankingReset"("userId", "resetAt" DESC);
CREATE INDEX IF NOT EXISTS "RankingReset_resetAt_idx" ON "RankingReset"("resetAt" DESC);
ALTER TABLE public."RankingReset" ENABLE ROW LEVEL SECURITY;

-- 2026-08-20d: AI Search 첨부를 비공개 버킷으로 분리
--
-- community-uploads는 public 버킷이다. 커뮤니티 글의 이미지는 어차피 공개 글에 붙는 것이라
-- 그래도 되지만, AI Search 첨부는 다르다 — 이용자가 Drive에서 가져온 개인 문서나 자기
-- 컴퓨터의 소스 코드가 URL만 알면 누구나 열리는 자리에 놓여 있었다.
-- 새 첨부는 이 비공개 버킷으로 가고, 앱은 서명 URL로만 내보낸다(app/api/ai-search/file).
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-attachments', 'ai-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 키가 "{userId}/..." 형태이므로(app/lib/storage.ts safeStorageKey) 첫 폴더로 소유자를 가른다.
DROP POLICY IF EXISTS "ai-attachments own read" ON storage.objects;
CREATE POLICY "ai-attachments own read" ON storage.objects FOR SELECT
  USING (bucket_id = 'ai-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "ai-attachments own insert" ON storage.objects;
CREATE POLICY "ai-attachments own insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ai-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "ai-attachments own delete" ON storage.objects;
CREATE POLICY "ai-attachments own delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'ai-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2026-08-20e: 커뮤니티 공지 상단 고정
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "pinned"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Post_pinned_pinnedAt_idx" ON "Post"("pinned", "pinnedAt" DESC);

-- 2026-08-20f: 문의게시판 채택 포인트(현상금)
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "bounty" INTEGER;

-- 2026-08-20g: 중고 거래 — 매물 · 1:1 대화 · 메시지
CREATE TABLE IF NOT EXISTS "MarketListing" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "postId"         TEXT NOT NULL UNIQUE,
  "sellerId"       UUID NOT NULL,
  "price"          INTEGER NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'selling',
  "condition"      TEXT NOT NULL DEFAULT 'used',
  "conditionNote"  TEXT,
  "region"         TEXT,
  "shipping"       BOOLEAN NOT NULL DEFAULT false,
  "shippingFee"    INTEGER,
  "sellerVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "soldAt"         TIMESTAMP(3),
  CONSTRAINT "MarketListing_postId_fkey"   FOREIGN KEY ("postId")   REFERENCES "Post"("id") ON DELETE CASCADE,
  CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "MarketListing_status_createdAt_idx" ON "MarketListing"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MarketListing_sellerId_idx" ON "MarketListing"("sellerId");

CREATE TABLE IF NOT EXISTS "MarketChat" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "listingId"      TEXT NOT NULL,
  "buyerId"        UUID NOT NULL,
  "sellerId"       UUID NOT NULL,
  "buyerHiddenAt"  TIMESTAMP(3),
  "sellerHiddenAt" TIMESTAMP(3),
  "lastMessageAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketChat_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE,
  CONSTRAINT "MarketChat_buyerId_fkey"   FOREIGN KEY ("buyerId")   REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "MarketChat_sellerId_fkey"  FOREIGN KEY ("sellerId")  REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketChat_listingId_buyerId_key" ON "MarketChat"("listingId", "buyerId");
CREATE INDEX IF NOT EXISTS "MarketChat_buyerId_lastMessageAt_idx"  ON "MarketChat"("buyerId", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "MarketChat_sellerId_lastMessageAt_idx" ON "MarketChat"("sellerId", "lastMessageAt" DESC);

CREATE TABLE IF NOT EXISTS "MarketMessage" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "chatId"     TEXT NOT NULL,
  "senderId"   UUID NOT NULL,
  "content"    TEXT NOT NULL,
  "systemKind" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt"   TIMESTAMP(3),
  "deletedAt"  TIMESTAMP(3),
  "readAt"     TIMESTAMP(3),
  CONSTRAINT "MarketMessage_chatId_fkey"   FOREIGN KEY ("chatId")   REFERENCES "MarketChat"("id") ON DELETE CASCADE,
  CONSTRAINT "MarketMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "MarketMessage_chatId_createdAt_idx" ON "MarketMessage"("chatId", "createdAt");

-- 앱은 Prisma(서버)로만 접근한다 — anon 키로 뚫리지 않도록 RLS만 켠다.
ALTER TABLE public."MarketListing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MarketChat"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MarketMessage" ENABLE ROW LEVEL SECURITY;
