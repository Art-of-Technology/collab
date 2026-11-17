'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Armchair, ArrowLeftRight, Bot, Compass, FileText, FolderTree, Home, KeyRound, LayoutTemplate, Layers, Play, Plug, ScrollText, Search, Send, SquareTerminal, Terminal, User,
  UserPlus, Webhook, Workflow, Wrench,
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
  '/docs/context/folders-and-files': FolderTree,
  '/docs/agents/overview': Armchair,
  '/docs/agents/create-a-seat': UserPlus,
  '/docs/agents/give-a-seat-work': Send,
  '/docs/agents/run-a-seat': Play,
  '/docs/agents/admit-a-runner': KeyRound,
  '/docs/agents/switch-to-seats': ArrowLeftRight,
  '/docs/agents/seats': ScrollText,
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
        <Link href="/dev/docs" className="flex items-start gap-2.5 px-3 py-1.5 text-sm text-collab-400 hover:text-foreground"><FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>API reference <span className="text-xs">↗</span></span></Link>
        <p className="px-3 text-xs text-muted-foreground">Sign in to explore the API.</p>
      </div>
    </nav>
  );
}
