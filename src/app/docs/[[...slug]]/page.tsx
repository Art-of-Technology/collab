import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allDocs, docHref, type DocPage } from '@/lib/docs';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { OnThisPage } from '@/components/docs/OnThisPage';
import { CopyMarkdownButton } from '@/components/docs/CopyMarkdownButton';
import { DocsDiagrams } from '@/components/docs/DocsDiagrams';

// A docs page for people: the same Markdown an agent reads at /docs/<page>.md, from the same loader.
// Only the pages of the navigation exist, all built ahead of time; /docs is the page "index".
type Props = { params: Promise<{ slug?: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return allDocs().map(page => ({ slug: page.slug === 'index' ? [] : page.slug.split('/') }));
}

async function find(params: Props['params']): Promise<{ pages: DocPage[]; at: number }> {
  const { slug } = await params;
  const pages = allDocs();
  return { pages, at: pages.findIndex(page => page.slug === (slug?.join('/') ?? 'index')) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pages, at } = await find(params);
  return at < 0 ? {} : { title: `${pages[at].title} · Collab docs`, description: pages[at].summary };
}

// The typography plugin puts a backtick before and after inline code; the last two classes take them away.
// A numbered list is drawn as steps (a number in a circle) and a quote as a note (a box with a coloured edge).
const typography = 'max-w-none text-sm leading-7 [&_h1]:mb-5 [&_h1]:text-4xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:border-t [&_h2]:border-border [&_h2]:pt-10 [&_h2]:text-2xl [&_h2]:tracking-tight [&_h3]:mt-8 [&_h3]:scroll-mt-24 [&_h3]:text-base [&_ol]:list-none [&_ol]:pl-0 [&_ol]:[counter-reset:step] [&_ol>li]:relative [&_ol>li]:pl-10 [&_ol>li]:[counter-increment:step] [&_ol>li]:before:absolute [&_ol>li]:before:left-0 [&_ol>li]:before:top-0.5 [&_ol>li]:before:flex [&_ol>li]:before:h-6 [&_ol>li]:before:w-6 [&_ol>li]:before:items-center [&_ol>li]:before:justify-center [&_ol>li]:before:rounded-full [&_ol>li]:before:bg-violet-500/15 [&_ol>li]:before:text-xs [&_ol>li]:before:font-semibold [&_ol>li]:before:text-violet-300 [&_ol>li]:before:content-[counter(step)] [&_blockquote]:rounded-md [&_blockquote]:border [&_blockquote]:border-border [&_blockquote]:border-l-2 [&_blockquote]:border-l-violet-400 [&_blockquote]:bg-muted/50 [&_blockquote]:px-4 [&_blockquote]:py-1 [&_blockquote]:font-normal [&_blockquote]:not-italic [&_blockquote]:text-foreground [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none [&_ul]:list-outside [&_ul]:pl-5 [&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_code]:before:content-none [&_code]:after:content-none';

export default async function DocsPage({ params }: Props) {
  const { pages, at } = await find(params);
  if (at < 0) notFound();
  const page = pages[at];
  const previous = pages[at - 1];
  const next = pages[at + 1];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_190px]">
      <main id="docs-content" className="min-w-0 px-5 py-8 sm:px-10 lg:px-12 lg:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex justify-end">
            <CopyMarkdownButton markdown={page.markdown} />
          </div>
          <details className="mb-8 rounded-lg border border-border p-4 xl:hidden">
            <summary className="cursor-pointer text-sm font-medium">On this page</summary>
            <div className="mt-3"><OnThisPage headings={page.headings} /></div>
          </details>
          <DocsDiagrams>
            <MarkdownRenderer content={page.markdown} headingIds={page.headings.map(heading => heading.id)} className={typography} />
          </DocsDiagrams>
          <footer className="mt-14 grid gap-4 border-t border-border py-8 text-sm sm:grid-cols-2">
            {previous ? (
              <Link href={docHref(previous.slug)} rel="prev" className="rounded-lg border border-border p-4 hover:bg-muted/40">
                <span className="block text-xs text-muted-foreground">Previous</span>{previous.title}
              </Link>
            ) : <span />}
            {next && (
              <Link href={docHref(next.slug)} rel="next" className="rounded-lg border border-border p-4 text-right hover:bg-muted/40">
                <span className="block text-xs text-muted-foreground">Next</span>{next.title}
              </Link>
            )}
          </footer>
        </div>
      </main>
      <aside className="hidden xl:block">
        <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-5 py-12"><OnThisPage headings={page.headings} /></div>
      </aside>
    </div>
  );
}
