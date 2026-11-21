/**
 * What a preview of a Context file is.
 *
 * Previews show images, PDFs, plain text and CSV tables. Other files show their name, type, size
 * and a download link.
 *
 * The kind follows the type the server worked out from the bytes (`context-file-type.ts`), never what
 * the browser called the upload. A name only ever decides between two readings of the same text — a
 * table or lines — so it cannot turn one kind of bytes into another.
 *
 * What is served inline is kept to what a browser draws:
 *
 *  - Text, whatever its type, leaves as JSON and is drawn as escaped text, so a file that says it is
 *    HTML is read, not run.
 *  - Images leave with their own type under `default-src 'none'; sandbox`, which blocks every script
 *    and every fetch even when the address is opened on its own. Only types a browser draws and never
 *    runs are in that list: an SVG is a document when it is opened on its own, so it is named here,
 *    not drawn.
 *  - Only the stored type `application/pdf` gets a frame. Uploads get that type from a `%PDF`
 *    prefix. The response sends the stored type with `nosniff`, so Chrome hands even a malformed
 *    PDF to its viewer, which runs separately from the Collab page. The iframe omits `sandbox`
 *    because the attribute blocks Chrome's viewer
 *    (CLB-854). Chrome ignores the response's CSP sandbox for PDFs. The header still allows viewer
 *    scripts under `sandbox allow-scripts` in browsers that enforce it.
 *
 * Only the start of a text file is read, and only a stated number of rows of a CSV: a preview of a
 * file of a few megabytes stays small, and says when there is more.
 */

export type ContextPreviewKind = 'image' | 'pdf' | 'text' | 'csv' | 'none';

/** At most this much of a text file is read, so a large one is still answered in one small reply. */
export const MAX_CONTEXT_PREVIEW_BYTES = 256 * 1024;
/** The stated number of rows a CSV preview shows; past it the preview says there are more. */
export const CONTEXT_PREVIEW_ROWS = 200;

/**
 * Types a browser draws by itself, and only ever draws. TIFF is left out: browsers do not draw it, and
 * a broken image is worse than a name. SVG is left out because it is not only drawn — opened on its
 * own it is a document the browser runs, so it would be one header away from running what a member
 * uploaded. It is named instead.
 */
const INLINE_IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp',
]);

/** Text that does not say `text/`, but is text all the same. */
const TEXT_TYPES = new Set(['application/xml', 'application/json']);

export type PreviewFile = { id: string; name: string; mimeType: string; size: number };

export function contextPreviewKind(file: { name: string; mimeType: string }): ContextPreviewKind {
  if (INLINE_IMAGE_TYPES.has(file.mimeType)) return 'image';
  if (file.mimeType === 'application/pdf') return 'pdf';
  if (file.mimeType.startsWith('text/') || TEXT_TYPES.has(file.mimeType)) {
    return file.mimeType === 'text/csv' || /\.csv$/i.test(file.name) ? 'csv' : 'text';
  }
  return 'none';
}

/** The kinds whose bytes are served as they are; the rest of a preview is JSON. */
export function isInlinePreview(kind: ContextPreviewKind): kind is 'image' | 'pdf' {
  return kind === 'image' || kind === 'pdf';
}

/**
 * A prefix can end in the middle of a character. Step back over the last one when it is incomplete,
 * so a decoded preview never ends in a replacement character that is not in the file.
 */
function trimPartialCharacter(bytes: Uint8Array): Uint8Array {
  for (let back = 1; back <= 4 && back <= bytes.length; back++) {
    const byte = bytes[bytes.length - back];
    if ((byte & 0xc0) === 0x80) continue;
    const needed = byte < 0x80 ? 1 : byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return needed > back ? bytes.subarray(0, bytes.length - back) : bytes;
  }
  return bytes;
}

export function decodePreviewText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(trimPartialCharacter(bytes));
}

/**
 * The rows of a CSV, the way the file writes them: a field may be quoted, and a quoted field may hold
 * commas, line breaks and doubled quotes. Nothing in a field is ever read as anything but a string.
 */
function parseCsv(text: string, stopAfter: number): { rows: string[][]; lastRowEnded: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Whether anything of a row has been read since the last line break: an unfinished row is still a row.
  let pending = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    pending = true;
    if (quoted) {
      if (character !== '"') { field += character; continue; }
      if (text[index + 1] === '"') { field += '"'; index++; continue; }
      quoted = false;
      continue;
    }
    if (character === '"' && field === '') { quoted = true; continue; }
    if (character === ',') { row.push(field); field = ''; continue; }
    if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
      pending = false;
      // One row past the limit is enough to know the file holds more; the rest is not read.
      if (rows.length >= stopAfter) break;
      continue;
    }
    field += character;
  }
  if (pending) {
    row.push(field);
    rows.push(row);
  }
  return { rows, lastRowEnded: !pending };
}

/**
 * A table of at most `CONTEXT_PREVIEW_ROWS` rows, and whether the file holds more. Bytes that were cut
 * short lose their last row: it is half a row, not a row.
 */
export function csvPreview(text: string, truncated: boolean, limit = CONTEXT_PREVIEW_ROWS) {
  const { rows, lastRowEnded } = parseCsv(text, limit + 1);
  if (truncated && !lastRowEnded) rows.pop();
  return { rows: rows.slice(0, limit), rowLimit: limit, hasMore: truncated || rows.length > limit };
}

/** A size a person reads, for the files that are named rather than shown. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

/** Where a preview of this file is read from. The bytes never leave by any other address. */
export function contextPreviewUrl(id: string): string {
  return `/api/context/files/${encodeURIComponent(id)}/preview`;
}

export function contextDownloadUrl(id: string): string {
  return `/api/context/files/${encodeURIComponent(id)}/download`;
}

/**
 * Headers for inline previews. See the module comment for the PDF sandbox rationale.
 *
 * `frame-ancestors` is not covered by `default-src`,
 * and an API reply inherits no policy from Collab's pages, so it has to be said here. It is `'self'`
 * rather than `'none'` because Collab's own preview frames the PDF.
 */
export function previewHeaders(file: { name: string; mimeType: string }, kind: 'image' | 'pdf'): Record<string, string> {
  const plain = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const sandbox = kind === 'pdf' ? 'sandbox allow-scripts' : 'sandbox';
  return {
    'Content-Type': file.mimeType,
    'Content-Disposition': `inline; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'none'; ${sandbox}; frame-ancestors 'self'`,
    'Cache-Control': 'private, no-store',
  };
}
