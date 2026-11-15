'use client';

import { useState } from 'react';

/** Copies the page's Markdown source, the same text an agent reads at the page's .md address. */
export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(markdown);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span role="status">{copied ? 'Copied' : 'Copy page as Markdown'}</span>
    </button>
  );
}
