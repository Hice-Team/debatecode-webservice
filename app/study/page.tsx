import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/app/components/page-shell';
import I18nSlot from '@/app/components/i18n-slot';
import { getSessionOptional } from '@/app/lib/dal';
import AiSearch from './ai-search';
import { hasModelCatalogAccess } from '@/app/lib/ai/search-answerer';

export const metadata: Metadata = { title: '학습' };

// 문서 사이트맵 — 외부 레퍼런스와 내부 학습 경로를 계층 구조로 정리한다.
const DOCS_SITEMAP: Array<{
  group: string;
  groupKey: string;
  links: Array<{ title: string; titleKey?: string; href: string; desc: string; descKey?: string; external?: boolean }>;
}> = [
  {
    group: '기초 언어',
    groupKey: 'docs-group-basics',
    links: [
      { title: 'Python Docs', href: 'https://docs.python.org/3/', desc: '문법·표준 라이브러리', descKey: 'docs-python-desc', external: true },
      { title: 'MDN JavaScript', href: 'https://developer.mozilla.org/ko/docs/Web/JavaScript', desc: '브라우저 동작·함수형 패턴', descKey: 'docs-js-desc', external: true },
      { title: 'Java Tutorial', href: 'https://docs.oracle.com/javase/tutorial/', desc: '객체지향·컬렉션·예외', descKey: 'docs-java-desc', external: true },
    ],
  },
  {
    group: '시스템 & 네이티브',
    groupKey: 'docs-group-systems',
    links: [
      { title: 'C Reference', href: 'https://en.cppreference.com/w/c', desc: '포인터·메모리', descKey: 'docs-c-desc', external: true },
      { title: 'C++ Reference', href: 'https://en.cppreference.com/w/cpp', desc: 'STL·모던 C++', descKey: 'docs-cpp-desc', external: true },
      { title: 'C# / .NET', href: 'https://learn.microsoft.com/dotnet/csharp/', desc: 'LINQ·비동기', descKey: 'docs-csharp-desc', external: true },
      { title: 'The Rust Book', href: 'https://doc.rust-lang.org/book/', desc: '소유권·안전한 동시성', descKey: 'docs-rust-desc', external: true },
    ],
  },
  {
    group: '웹 & 앱',
    groupKey: 'docs-group-web',
    links: [
      { title: 'TypeScript Docs', href: 'https://www.typescriptlang.org/docs/', desc: '정적 타입·제네릭', descKey: 'docs-ts-desc', external: true },
      { title: 'Dart Guides', href: 'https://dart.dev/guides', desc: 'Flutter용 타입 안전 언어', descKey: 'docs-dart-desc', external: true },
      { title: 'Web 표준 (MDN)', href: 'https://developer.mozilla.org/ko/docs/Web', desc: 'HTML·CSS·HTTP', external: true },
    ],
  }
];

export default async function StudyPage() {
  const session = await getSessionOptional();
  // 최근 AI Search 세션 — 로그인 상태에서만 조회한다

  // 코스웨어 목록(courses) 조회는 걷어냈다. 아래 코스 카드 JSX가 주석 처리돼 있어서
  // 결과를 아무도 쓰지 않는데, 강의마다 레슨과 사용자별 진도까지 조인하는 무거운 쿼리가
  // /study 방문마다 돌고 있었다. 코스웨어를 다시 켤 때 이 자리에 되살린다.

  return (
    <PageShell width="6xl">
        {/* AI Search — 문서 사이트맵 위. 여러 언어/라이브러리 문서를 한 번에 훑는다 */}
        <AiSearch liveModel={hasModelCatalogAccess()} authed={!!session} />

        {/* 문서 사이트맵 — 카드 대신 계층형 링크 트리 */}
        <section className="mb-14">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-4">DOCS SITEMAP</h2>
          <div className="rounded-[var(--radius-panel)] border border-hairline bg-surface p-6 sm:p-8">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {DOCS_SITEMAP.map((section) => (
                <div key={section.group}>
                  <p className="mb-3 border-b border-hairline pb-2 text-sm font-bold text-fg">
                    <I18nSlot k={section.groupKey} fallback={section.group} />
                  </p>
                  <ul className="space-y-0.5 border-l border-hairline">
                    {section.links.map((link) => {
                      const inner = (
                        <>
                          <span className="font-medium text-fg group-hover:text-brand-600 transition-colors">
                            {link.titleKey ? <I18nSlot k={link.titleKey} fallback={link.title} /> : link.title}
                            {link.external && <span className="ml-1 text-[10px] text-fg-quiet">↗</span>}
                          </span>
                          <span className="block text-xs text-fg-muted">
                            {link.descKey ? <I18nSlot k={link.descKey} fallback={link.desc} /> : link.desc}
                          </span>
                        </>
                      );
                      return (
                        <li key={link.title} className="relative pl-4 before:absolute before:left-0 before:top-[0.95rem] before:h-px before:w-2.5 before:bg-ink/10">
                          {link.external ? (
                            <a href={link.href} target="_blank" rel="noreferrer" className="group block rounded-md px-2 py-1.5 text-sm hover:bg-paper/80">
                              {inner}
                            </a>
                          ) : (
                            <Link href={link.href} className="group block rounded-md px-2 py-1.5 text-sm hover:bg-paper/80">
                              {inner}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
    </PageShell>
  );
}
