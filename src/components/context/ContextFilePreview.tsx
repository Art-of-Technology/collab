'use client';

import { useEffect, useState } from 'react';
import {
  contextDownloadUrl, contextPreviewKind, contextPreviewUrl, formatFileSize, PreviewFile,
} from '@/lib/context-file-preview';

/**
 * A file of a Context folder, shown rather than downloaded.
 *
 * An image is drawn as an image and a PDF in the browser's viewer, both straight from
 * `/api/context/files/[id]/preview`, which serves them sealed (see `previewHeaders`). A text file and
 * a CSV are read from the same address as JSON and drawn here as text: React escapes every character,
 * so a file that says it is HTML is read and never run. A PDF sits in a frame the browser's viewer fills.
 * Anything else is named — its name, type and size — with a download beside it.
 */

type ReadPreview =
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'csv'; rows: string[][]; hasMore: boolean };

export function ContextFilePreview({ file, className = '' }: { file: PreviewFile; className?: string }) {
  const kind = contextPreviewKind(file);
  // What was read, and which file it was read for: another file is being read until its own reply lands.
  const [state, setState] = useState<{ id: string; read?: ReadPreview; error?: string }>({ id: '' });
  const loaded = state.id === file.id ? state : null;

  useEffect(() => {
    if (kind !== 'text' && kind !== 'csv') return;
    let current = true;
    fetch(contextPreviewUrl(file.id))
      .then(async response => {
        // A reply that is not JSON is a reply that failed: what a parser calls it is not for a member to read.
        const body = await response.json().catch(() => null);
        if (!response.ok || !body) {
          throw new Error(typeof body?.error === 'string' ? body.error : 'This file could not be read');
        }
        return body as ReadPreview;
      })
      .then(body => { if (current) setState({ id: file.id, read: body }); })
      .catch(failure => {
        if (current) setState({ id: file.id, error: failure instanceof Error ? failure.message : 'This file could not be read' });
      });
    return () => { current = false; };
  }, [file.id, kind]);

  return <section className={`flex min-h-0 flex-col gap-3 ${className}`} aria-label={`Preview of ${file.name}`}>
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-medium" title={file.name}>{file.name}</p>
        <p className="text-sm text-muted-foreground">{file.mimeType} · {formatFileSize(file.size)}</p>
      </div>
      <a href={contextDownloadUrl(file.id)} download
        className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">Download</a>
    </header>
    <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30">
      {kind === 'image' &&
        // eslint-disable-next-line @next/next/no-img-element
        <img src={contextPreviewUrl(file.id)} alt={file.name} className="mx-auto max-h-[70vh] object-contain" />}
      {/* No sandbox mark: Chrome will not start its PDF viewer in a sandboxed frame (CLB-854). The frame
          is only ever drawn for a stored type of PDF, set from the bytes, served `nosniff`, so it only
          ever holds the browser's viewer, which runs apart from this page. */}
      {kind === 'pdf' && <>
        <iframe src={contextPreviewUrl(file.id)} title={file.name}
          className="h-[70vh] w-full border-0" />
        <p className="border-t px-3 py-2 text-sm text-muted-foreground">
          A PDF opens in the browser&apos;s own viewer. If it does not appear, download the file.
        </p>
      </>}
      {kind === 'none' && <p className="p-6 text-center text-sm text-muted-foreground">
        This kind of file is not shown here. Download it to open it.
      </p>}
      {(kind === 'text' || kind === 'csv') && (
        loaded?.error ? <p className="p-6 text-center text-sm text-destructive">{loaded.error}</p>
          : !loaded?.read ? <p className="p-6 text-center text-sm text-muted-foreground">Reading this file…</p>
            : loaded.read.kind === 'csv' ? <CsvTable csv={loaded.read} />
              : <>
                <pre className="whitespace-pre-wrap break-words p-4 text-sm">{loaded.read.text}</pre>
                {loaded.read.truncated && <p className="border-t px-4 py-2 text-sm text-muted-foreground">
                  Only the start of this file is shown. Download it to read all of it.
                </p>}
              </>
      )}
    </div>
  </section>;
}

/** The first row names the columns: a CSV preview is read, so what a cell holds stays a string. */
function CsvTable({ csv }: { csv: Extract<ReadPreview, { kind: 'csv' }> }) {
  const [head, ...rest] = csv.rows;
  // No rows and more to come is not an empty file: its first row is longer than the bytes that were read.
  if (!head) return <p className="p-6 text-center text-sm text-muted-foreground">
    {csv.hasMore ? 'The first row of this file is too long to show. Download it to read it.' : 'This file is empty.'}
  </p>;
  return <>
    <table className="w-full border-collapse text-left text-sm">
      <thead className="sticky top-0 bg-muted">
        <tr>{head.map((cell, column) => <th key={column} className="border-b px-3 py-2 font-medium">{cell}</th>)}</tr>
      </thead>
      <tbody>
        {rest.map((row, index) => <tr key={index}>
          {row.map((cell, column) => <td key={column} className="border-b px-3 py-1.5 align-top">{cell}</td>)}
        </tr>)}
      </tbody>
    </table>
    {/* The rows that are here, not the stated limit: a file of wide rows runs out of bytes before rows. */}
    {csv.hasMore && <p className="border-t px-3 py-2 text-sm text-muted-foreground">
      The first {csv.rows.length} rows are shown. This file has more.
    </p>}
  </>;
}
