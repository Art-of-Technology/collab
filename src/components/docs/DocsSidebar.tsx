'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Armchair, Bot, Compass, FileText, Home, LayoutTemplate, Layers, Plug, Search, SquareTerminal, Terminal, User, Webhook, Workflow, Wrench,
  type LucideIcon,
} from 'lucide-react';

export type DocsSidebarSection = { title: string; pages: { href: string; title: string }[] };

// One icon per page, by its address. A page that is not listed here gets the plain page icon.
const ICONS: Record<string, LucideIcon> = {
  '/docs': Home,
  '/docs/start/people': User,
  '/docs/start/agents': Bot,
  '/docs/concepts': Layers,
  '/docs/cli': Terminal,
  '/docs/agents/seats': Armchair,
  '/docs/agents/protocol': Workflow,
  '/docs/agents/runner-contract': Plug,
  '/docs/agents/integrations': Webhook,
  '/docs/reference/cli-commands': SquareTerminal,
  '/docs/reference/mcp-tools': Wrench,
  '/docs/reference/search': Search,
  '/docs/reference/project-context': Compass,
  '/docs/reference/issue-templates': LayoutTemplate,
};

/** The sections and pages of the documentation, each page with its icon, with the page being read marked. */
export function DocsSidebar({ sections }: { sections: DocsSidebarSection[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="space-y-7">
      {sections.map(section => (
        <div key={section.title}>
          <p className="mb-2 px-3 text-xs font-semibold text-foreground">{section.title}</p>
          {section.pages.map(page => {
            const Icon = ICONS[page.href] ?? FileText;
            return (
              <Link
                key={page.href}
                href={page.href}
                aria-current={pathname === page.href ? 'page' : undefined}
                className="group flex items-start gap-2.5 rounded-md px-3 py-1.5 text-sm text-collab-400 transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 group-aria-[current=page]:text-violet-400" aria-hidden="true" />
                {page.title}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="border-t border-border pt-5">
        <p className="mb-2 px-3 text-xs font-semibold text-foreground">Build integrations</p>
        <Link href="/dev/docs" className="block px-3 py-1.5 text-sm text-collab-400 hover:text-foreground">API reference <span className="text-xs">↗</span></Link>
        <p className="px-3 text-xs text-muted-foreground">Sign in to explore the API.</p>
      </div>
    </nav>
  );
}
