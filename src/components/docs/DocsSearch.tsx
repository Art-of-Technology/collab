'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { searchDocs, type DocsIndexEntry } from '@/lib/docs-search';

/** Search of the documentation: a button in the header, and ⌘K or Ctrl+K on any docs page. */
export function DocsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<DocsIndexEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      request.current?.abort();
      setFailed(false);
      setOpen(value => !value);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The index is fetched when the search is first opened, not with every page. After a failure, opening it again tries again,
  // and the message of the failure goes when the search is closed.
  useEffect(() => {
    if (!open || index) return;
    const controller = new AbortController();
    request.current = controller;
    fetch('/docs-index.json', { signal: controller.signal })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then(result => { if (!controller.signal.aborted) setIndex(result); }, () => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [open, index]);

  const hits = index ? searchDocs(index, query) : [];
  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search the docs"
        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Search the docs</span>
        <kbd className="hidden rounded border border-border px-1.5 font-sans text-[10px] sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onOpenChange={value => { if (!value) request.current?.abort(); setOpen(value); setFailed(false); }}>
        <DialogContent className="overflow-hidden p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Search the docs</DialogTitle>
          {/* The shared search has already chosen and ordered the hits; the list must not filter them again. */}
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search the docs" />
            <CommandList>
              {query.trim() !== '' && (
                <CommandEmpty>{index ? 'No page matches.' : failed ? 'The search could not be loaded. Close it and open it again.' : 'Loading…'}</CommandEmpty>
              )}
              {hits.map(hit => (
                <CommandItem key={hit.href} value={hit.href} onSelect={() => go(hit.href)} className="flex-col items-start gap-1">
                  <span className="font-medium">
                    {hit.title}
                    {hit.heading !== hit.title && <span className="text-muted-foreground"> › {hit.heading}</span>}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{hit.excerpt}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
