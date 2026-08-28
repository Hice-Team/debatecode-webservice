import { PageShell } from '@/app/components/page-shell';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell width="3xl">
        <article className="prose-legal text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-6 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:text-[15px] [&_h3]:font-bold [&_h3]:mt-5 [&_h3]:mb-1.5 [&_p]:my-2 [&_p]:text-fg [&_li]:text-fg [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:my-3 [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-hairline [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-ink/5">
          {children}
        </article>
    </PageShell>
  );
}
