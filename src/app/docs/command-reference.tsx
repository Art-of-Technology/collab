'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { commands, flagName } from '../../../packages/cli/src/commands.mjs';

type Command = {
  method: string;
  path: string;
  fields: Record<string, string>;
  query: Record<string, string>;
  required?: string[];
  pagination?: string[];
};

const entries: [string, Command][] = Object.entries(commands);

export function CommandReference() {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const filtered = entries.filter(([name, spec]) =>
    [name, ...Object.keys(spec.fields).map(flagName), ...Object.keys(spec.query).map(flagName)]
      .join(' ').toLowerCase().includes(query)
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search CLI commands and flags"
          placeholder="Find a command or flag…"
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="h-10 pl-10"
        />
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {filtered.length} of {entries.length} API commands. Expand a command for its arguments and flags.
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {filtered.map(([name, spec]) => {
          const args = [...spec.path.matchAll(/:(\w+)/g)].map(([, key]) => key === 'childId' ? 'CHILD_ID' : 'ID');
          const options = { ...spec.fields, ...spec.query };
          return (
            <details key={name} className="group min-w-0 px-4 open:bg-muted/30">
              <summary className="cursor-pointer py-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                <span className="ml-2 inline-flex max-w-full flex-wrap items-center gap-2 align-middle">
                  <code className="break-words font-mono">collab {name}</code>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {spec.method === 'GET' ? 'Read' : spec.method === 'DELETE' ? 'Delete' : 'Write'}
                  </span>
                </span>
              </summary>
              <div className="space-y-4 pb-5 text-sm">
                <code className="block break-words rounded-md bg-collab-950 p-3 text-collab-50">
                  {['collab', name, ...args, ...(spec.method === 'DELETE' ? ['--yes'] : [])].join(' ')}
                </code>
                {args.length > 0 && (
                  <p className="text-muted-foreground">
                    ID is the {spec.path.startsWith('issues/') ? 'issue ID or key (such as APP-123)' : 'resource ID'}.
                    {args.length > 1 && ' CHILD_ID is the relation or work log ID.'}
                  </p>
                )}
                {Object.keys(options).length > 0 ? (
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    {Object.entries(options).map(([field, type]) => (
                      <div key={field} className="flex min-w-0 flex-wrap items-baseline gap-2">
                        <dt><code className="break-all">--{flagName(field)}</code></dt>
                        <dd className="text-xs text-muted-foreground">
                          {type}{spec.required?.includes(field) ? ' · required' : ''}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="text-muted-foreground">No command-specific flags. Common request flags still apply.</p>}
                {spec.pagination && <p className="text-muted-foreground">Supports --all to fetch every page.</p>}
              </div>
            </details>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No commands match “{search}”. Try issues, notes, or a flag such as due-date.
        </p>
      )}
    </div>
  );
}
