-- 디베이트메이트 신청서를 PDF 한 장으로 받는다.
--
-- 지원 동기 칸을 폼에서 뺐으므로 NOT NULL을 풀어 준다. 값을 지우지는 않는다 —
-- 이미 접수된 신청서의 본문은 심사 이력이고, 지운다고 얻는 것이 없다.
ALTER TABLE "DebateMateApplication" ALTER COLUMN "motivation" DROP NOT NULL;
