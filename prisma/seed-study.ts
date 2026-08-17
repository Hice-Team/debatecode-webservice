// debateStudy 코스웨어 전용 시드. 유저/제출/커뮤니티를 건드리는 prisma/seed.ts와 분리해
// Course/Lesson만 upsert한다 (Supabase Auth 사용자 재생성 등 위험한 작업과 무관).
import { PrismaClient } from '../app/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface SeedLesson {
  slug: string;
  title: string;
  content: string;
}

interface SeedCourse {
  slug: string;
  title: string;
  description: string;
  language: string;
  order: number;
  lessons: SeedLesson[];
}

const courses: SeedCourse[] = [
  {
    slug: 'python-basics',
    title: '파이썬 기초 3강',
    description: '변수와 자료형부터 반복·조건문까지, 알고리즘 풀이에 필요한 파이썬 문법의 핵심만 압축했습니다.',
    language: 'python',
    order: 1,
    lessons: [
      {
        slug: '01-variables-and-types',
        title: '1강. 변수와 자료형',
        content: `## 변수 선언

파이썬은 타입을 명시하지 않아도 됩니다. 변수는 값이 대입되는 순간 타입이 결정됩니다.

\`\`\`python
name = "디베이트코드"   # str
age = 3                 # int
score = 91.5             # float
is_active = True         # bool
\`\`\`

## 핵심 자료형

| 타입 | 설명 | 예시 |
|---|---|---|
| \`int\` | 정수 | \`42\` |
| \`float\` | 실수 | \`3.14\` |
| \`str\` | 문자열 | \`"hello"\` |
| \`list\` | 순서가 있는 가변 배열 | \`[1, 2, 3]\` |
| \`dict\` | 키-값 매핑(해시 맵) | \`{"a": 1}\` |

## 왜 중요할까요?

DebateAI 면접에서 "이 변수의 타입은 왜 리스트가 아니라 딕셔너리인가요?" 같은 질문을 받을 수 있습니다.
자료형의 특성을 정확히 이해하면 그 이유를 논리적으로 설명할 수 있습니다.

## 연습 문제

\`\`\`python
# 정수 나눗셈과 실수 나눗셈의 차이를 확인해 보세요
print(7 // 2)   # 3  (몫)
print(7 / 2)    # 3.5 (실수 나눗셈)
print(7 % 2)    # 1  (나머지)
\`\`\`

다음 강의에서는 리스트와 딕셔너리를 깊이 다룹니다.`,
      },
      {
        slug: '02-list-and-dict',
        title: '2강. 리스트와 딕셔너리',
        content: `## 리스트(List)

순서가 있고 변경 가능한 배열입니다. 알고리즘 문제의 대부분이 리스트로 입력을 받습니다.

\`\`\`python
nums = [3, 1, 4, 1, 5]
nums.append(9)        # [3, 1, 4, 1, 5, 9]
nums.sort()            # [1, 1, 3, 4, 5, 9]
first = nums[0]        # 인덱싱 O(1)
\`\`\`

## 딕셔너리(Dict) — 파이썬의 해시 맵

키를 통해 값을 O(1)에 조회할 수 있는 자료구조입니다. \`두 수의 합\` 같은 문제의 핵심 무기입니다.

\`\`\`python
seen = {}
for i, num in enumerate([2, 7, 11, 15]):
    if 9 - num in seen:
        print(seen[9 - num], i)
        break
    seen[num] = i
\`\`\`

## 리스트 컴프리헨션

\`\`\`python
squares = [n * n for n in range(5)]     # [0, 1, 4, 9, 16]
evens = [n for n in range(10) if n % 2 == 0]
\`\`\`

## 면접 포인트

"리스트로 탐색하면 O(n)인데 왜 딕셔너리를 쓰지 않았나요?"라는 질문에 대비해,
두 자료구조의 탐색 복잡도 차이(O(n) vs O(1))를 항상 설명할 수 있어야 합니다.`,
      },
      {
        slug: '03-loops-and-conditions',
        title: '3강. 반복문과 조건문',
        content: `## for / while

\`\`\`python
for i in range(5):
    print(i)          # 0 1 2 3 4

n = 5
while n > 0:
    n -= 1
\`\`\`

## 조건문과 엣지 케이스

\`\`\`python
def solution(nums):
    if not nums:              # 빈 리스트 방어
        return 0
    return max(nums)
\`\`\`

DebateAI가 가장 자주 파고드는 지점이 바로 이 **엣지 케이스 방어**입니다.
빈 입력, 최소 크기 입력, 음수 등 경계 조건에서 코드가 어떻게 동작하는지 항상 검토하세요.

## break / continue

\`\`\`python
for n in range(10):
    if n == 3:
        continue     # 3을 건너뛰고 계속
    if n == 7:
        break        # 7에서 반복 종료
    print(n)
\`\`\`

## 다음 단계

이제 [문제집](/problems)에서 \`해시\` 카테고리 문제부터 도전해 보세요.
정답을 맞히면 DebateAI가 오늘 배운 개념(자료형, 딕셔너리, 엣지 케이스)을 정확히 파고들 것입니다.`,
      },
    ],
  },
];

async function main() {
  console.log('🌱 debateStudy 시드 시작…');
  for (const c of courses) {
    const course = await prisma.course.upsert({
      where: { slug: c.slug },
      update: { title: c.title, description: c.description, language: c.language, order: c.order },
      create: { slug: c.slug, title: c.title, description: c.description, language: c.language, order: c.order },
    });
    for (const [i, l] of c.lessons.entries()) {
      await prisma.lesson.upsert({
        where: { courseId_slug: { courseId: course.id, slug: l.slug } },
        update: { title: l.title, content: l.content, order: i },
        create: { courseId: course.id, slug: l.slug, title: l.title, content: l.content, order: i },
      });
    }
    console.log(`  ✓ ${c.title} (${c.lessons.length}강)`);
  }
  console.log('🌱 debateStudy 시드 완료');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
