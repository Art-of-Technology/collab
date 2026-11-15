'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type DocsSidebarSection = { title: string; pages: { href: string; title: string }[] };

/** The sections and pages of the documentation, with the page being read marked. */
export function DocsSidebar({ sections }: { sections: DocsSidebarSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="space-y-7">
      {sections.map(section => (
        <div key={section.title}>
          <p className="mb-3 text-xs font-semibold text-muted-foreground">{section.title}</p>
          {section.pages.map(page => (
            <Link
              key={page.href}
              href={page.href}
              aria-current={pathname === page.href ? 'page' : undefined}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {page.title}
            </Link>
          ))}
        </div>
      ))}
      <div className="border-t border-border pt-5">
        <p className="mb-3 text-xs font-semibold text-muted-foreground">Build integrations</p>
        <Link href="/dev/docs" className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground">API reference <span className="text-xs">↗</span></Link>
        <p className="px-3 text-xs text-muted-foreground">Sign in to explore the API.</p>
      </div>
    </nav>
  );
}
