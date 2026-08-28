-- 로그인 단계 2차 인증
--
-- 세션 하나가 2차 인증을 통과했다는 기록을 둔다. 왜 세션 단위인지는
-- prisma/schema.prisma의 TwoFactorSession 주석에 적어 두었다 — 요약하면,
-- Supabase는 비밀번호가 맞는 순간 세션을 발급하므로 그 앞을 막는 대신
-- **통과하지 않은 세션이 아무것도 열지 못하게** 하는 쪽을 택했다.
--
-- 순수 추가다. 기존 행을 지우거나 바꾸지 않는다.

CREATE TABLE IF NOT EXISTS "TwoFactorSession" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "sessionId"  TEXT NOT NULL,
  "userId"     UUID NOT NULL,
  "method"     TEXT NOT NULL,
  "userAgent"  TEXT,
  "ipMasked"   TEXT,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TwoFactorSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TwoFactorSession_sessionId_key"        ON "TwoFactorSession"("sessionId");
CREATE INDEX        IF NOT EXISTS "TwoFactorSession_userId_verifiedAt_idx" ON "TwoFactorSession"("userId", "verifiedAt" DESC);
CREATE INDEX        IF NOT EXISTS "TwoFactorSession_expiresAt_idx"         ON "TwoFactorSession"("expiresAt");

-- 만료된 통과 기록 정리 (콘솔 › 시스템의 "만료 데이터 정리"가 부른다)
CREATE OR REPLACE FUNCTION public.two_factor_session_sweep()
RETURNS INT
LANGUAGE plpgsql
AS $fn$
DECLARE n INT;
BEGIN
  DELETE FROM "TwoFactorSession" WHERE "expiresAt" <= (now() AT TIME ZONE 'utc');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;
