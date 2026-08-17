# debateCode — 대화형 온라인 저지

정답 채점으로 끝나지 않는 온라인 저지. 문제의 테스트를 전부 통과하면 **DebateAI 면접관**이 코드의 취약점(복잡도, 자료구조 트레이드오프, 엣지 케이스)을 파고드는 꼬리질문을 던지고, 사용자는 채팅으로 논리를 방어하며 실시간으로 코드를 리팩터링합니다. 공방이 끝나면 **방어 성공률 리포트**가 발행되고, 약점 키워드는 대시보드 오답노트에 적재됩니다.

## 시작하기

```bash
npm install
npx prisma migrate dev # Supabase Postgres에 스키마 적용
npx prisma db seed     # 문제 7개 + 데모(관리자) 유저 시드
npm run dev
```

- 데모 계정: `demo@debate.code` / `demo1234` (관리자 권한, 완료된 면접 리포트 2건 포함)
- 환경변수는 `.env` 참조 (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`)

## 아키텍처

| 영역 | 구현 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, `proxy.ts` 미들웨어, async `params`/`cookies`) |
| DB | Supabase Postgres + Prisma 6 — `prisma/schema.prisma` |
| 인증 | Supabase Auth(이메일/비밀번호, 비밀번호 재설정) + DAL 패턴(`app/lib/dal.ts`). 가입 시 DB 트리거가 `auth.users` → `public.User`를 동기화 |
| 에디터 | Monaco (`@monaco-editor/react`, CDN 로드, ink 커스텀 테마) |
| 채점 | **브라우저 내 실행** — Web Worker(`public/judge/js-runner.js`) + Pyodide(`py-runner.js`) |
| AI 면접관 | 목업 프로바이더(`app/lib/ai/mock-interviewer.ts`) — 휴리스틱 정적 분석 + 한국어 질문 뱅크 + 키워드 기반 채점. `app/lib/ai/provider.ts` 인터페이스만 구현하면 실제 LLM(Anthropic/Gemini)으로 교체 가능 |

## 주요 플로우

1. `/problems` → 문제 선택 (언어별/난이도별/기출 기업별/주제별 필터) → 좌 지문 / 우 Monaco 에디터 (JS·Python)
2. **실행** = 공개 케이스, **제출** = 전체(히든 포함) 케이스
3. 전체 통과 → **면접 방식 선택**: 기본 모드(시간 무제한) / 엄격 모드(답변당 90초) + 보이스 모드(TTS로 질문 듣기 + 마이크 답변, Chrome/Edge)
4. 3~4라운드 공방 (3연속 완벽 방어 시 조기 종료) — 면접 중에도 에디터에서 라이브 리팩터링 가능하며 AI가 변경을 인지
5. 리포트 발행 → `/dashboard`에 면접 응답률·평균 방어 성공률·약점 키워드 오답노트 반영

## 페이지 구성

- `/study` — 언어별 커리큘럼/코스웨어 소개 + 개념 퀵뷰
- `/problems` — 문제집 (언어/난이도/기출/주제 필터)
- `/contests` — 코딩테스트 (기업 기출 세트)
- `/community` — 자유게시판 / 멘토게시판 / 문의게시판 / 중고게시판
- `/settings/ai` — DebateAI 모델 설정

## DebateAI 모델 설정 (`/settings/ai`)

사용자별로 면접관 AI를 선택할 수 있습니다:

| 프로바이더 | 필요한 것 | 비고 |
|---|---|---|
| 내장 면접관 (기본) | 없음 | 휴리스틱 분석 + 질문 뱅크 |
| Anthropic Claude | API 키 | 기본 모델 `claude-sonnet-5` |
| Google Gemini | API 키 | 기본 모델 `gemini-2.5-flash` |
| 로컬 LLM | Ollama/LM Studio 설치 | OpenAI 호환 엔드포인트 (예: `http://localhost:11434/v1`) |

LLM 호출이 실패하면 자동으로 내장 면접관으로 폴백합니다.

## 알려진 한계

- **클라이언트 채점**: 코드 실행이 브라우저에서 이루어지므로 판정(verdict)은 위조 가능합니다. 제출 코드가 함께 저장되어 감사는 가능하지만, 경쟁 목적의 공식 채점에는 서버 사이드 실행 엔진이 필요합니다.
- **Pyodide 첫 로드**: Python 선택 시 CDN에서 ~6MB wasm을 받아 첫 실행이 3~10초 걸립니다 (로딩 배너 표시).
- **타임아웃 처리**: Web Worker는 선점 중단이 불가해 시간 초과 시 워커를 종료하고 재생성합니다. Python은 이때 런타임을 다시 불러옵니다.
- **AI 면접관은 목업**: 규칙 기반이므로 답변의 의미를 진짜로 이해하지 못합니다. 키워드·논증 구조·코드 언급 여부로 채점합니다.
