import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { docHref, docsNav } from '@/lib/docs';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { DocsSearch } from '@/components/docs/DocsSearch';

export default function DocsLayout({ children }: { children: ReactNode }) {
  const sections = docsNav().map(section => ({
    title: section.title,
    pages: section.pages.map(page => ({ href: docHref(page.slug), title: page.title })),
  }));
  return (
    <div className="min-h-screen bg-collab-950 text-foreground">
      <a href="#docs-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-background focus:p-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-collab-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/home" aria-label="Collab home">
              <Image unoptimized src="/logo-text.svg" width={100} height={26} alt="Collab" className="h-6 w-auto" />
            </Link>
            <span className="text-border" aria-hidden="true">/</span>
            <Link href="/docs" className="text-sm font-medium">Docs</Link>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <DocsSearch />
            <Link href="/" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted">
              Open Collab <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border lg:block">
          <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-6 py-10"><DocsSidebar sections={sections} /></div>
        </aside>
        <div className="min-w-0">
          <details className="mx-5 mt-6 rounded-lg border border-border p-4 sm:mx-10 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">All pages</summary>
            <div className="mt-3"><DocsSidebar sections={sections} /></div>
          </details>
          {children}
        </div>
      </div>
    </div>
  );
}
