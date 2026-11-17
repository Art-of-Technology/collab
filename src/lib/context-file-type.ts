/**
 * What a file is, worked out from its first bytes.
 *
 * The type a browser sends with an upload is the uploader's word for it, so Context never keeps it.
 * The type kept here is a label for the people who see the file in a folder; it is never what the
 * bytes are served with. A download always leaves as an attachment of one opaque type (see
 * `downloadHeaders` in `context-files.ts`), so a file that says it is HTML still cannot run.
 *
 * Bytes we do not recognise are text when they read as text, and `application/octet-stream`
 * otherwise: a file of any kind can be uploaded, so this never refuses one.
 */

export const UNKNOWN_FILE_TYPE = 'application/octet-stream';

/** Magic numbers, longest first so a longer signature is never shadowed by a shorter one. */
const SIGNATURES: { prefix: string; offset?: number; mime: string }[] = [
  { prefix: '89504e470d0a1a0a', mime: 'image/png' },
  { prefix: '377abcaf271c', mime: 'application/x-7z-compressed' },
  { prefix: '526172211a07', mime: 'application/vnd.rar' },
  { prefix: '474946383761', mime: 'image/gif' },
  { prefix: '474946383961', mime: 'image/gif' },
  { prefix: '4f676753', mime: 'application/ogg' },
  { prefix: '1a45dfa3', mime: 'video/webm' },
  { prefix: '25504446', mime: 'application/pdf' },
  { prefix: '49492a00', mime: 'image/tiff' },
  { prefix: '4d4d002a', mime: 'image/tiff' },
  { prefix: '494433', mime: 'audio/mpeg' },
  { prefix: 'ffd8ff', mime: 'image/jpeg' },
  { prefix: '1f8b', mime: 'application/gzip' },
  { prefix: 'fffb', mime: 'audio/mpeg' },
  { prefix: 'fff3', mime: 'audio/mpeg' },
  { prefix: '424d', mime: 'image/bmp' },
  { prefix: '66747970', offset: 4, mime: 'video/mp4' },
];

/** A RIFF container says what it holds four bytes after its size. */
const RIFF_FORMS: Record<string, string> = { WEBP: 'image/webp', WAVE: 'audio/wav', 'AVI ': 'video/x-msvideo' };

const ZIP = '504b0304';
// A ZIP that is really an Office document carries parts named after the application that wrote it.
const OOXML_PARTS: { part: string; mime: string }[] = [
  { part: 'word/', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { part: 'xl/', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { part: 'ppt/', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

function startsWith(bytes: Uint8Array, prefix: string, offset = 0): boolean {
  if (bytes.length < offset + prefix.length / 2) return false;
  for (let index = 0; index * 2 < prefix.length; index++) {
    if (bytes[offset + index] !== parseInt(prefix.slice(index * 2, index * 2 + 2), 16)) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * The bytes read as text when they decode as UTF-8 and hold no control characters. Only the start is
 * read: a tail that is not text is already enough of a surprise to leave the file as octet-stream.
 */
function asText(bytes: Uint8Array): string | null {
  const window = bytes.subarray(0, 4096);
  let end = window.length;
  if (end === 4096) {
    // The window may cut a character in half: step back over its tail bytes, then over its lead byte.
    while (end > 0 && (window[end - 1] & 0xc0) === 0x80) end--;
    if (end > 0 && (window[end - 1] & 0x80) !== 0) end--;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(window.subarray(0, end));
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? null : text;
  } catch {
    return null;
  }
}

/** An OpenDocument archive names its own type in a first, uncompressed entry called `mimetype`. */
function openDocumentType(bytes: Uint8Array): string | null {
  if (ascii(bytes, 30, 8) !== 'mimetype') return null;
  const length = bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24);
  if (length <= 0 || length > 120 || bytes.length < 38 + length) return null;
  const declared = ascii(bytes, 38, length);
  return /^application\/vnd\.oasis\.opendocument\.[a-z-]+$/.test(declared) ? declared : null;
}

function zipType(bytes: Uint8Array): string {
  const openDocument = openDocumentType(bytes);
  if (openDocument) return openDocument;
  const head = ascii(bytes, 0, Math.min(bytes.length, 4096));
  if (!head.includes('[Content_Types].xml')) return 'application/zip';
  return OOXML_PARTS.find(({ part }) => head.includes(part))?.mime ?? 'application/zip';
}

export function detectFileType(bytes: Uint8Array): string {
  for (const { prefix, offset, mime } of SIGNATURES) {
    if (startsWith(bytes, prefix, offset)) return mime;
  }
  if (startsWith(bytes, '52494646') && RIFF_FORMS[ascii(bytes, 8, 4)]) return RIFF_FORMS[ascii(bytes, 8, 4)];
  if (startsWith(bytes, ZIP)) return zipType(bytes);
  const text = asText(bytes);
  if (text === null) return UNKNOWN_FILE_TYPE;
  const start = text.trimStart().slice(0, 512).toLowerCase();
  if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) return 'image/svg+xml';
  if (start.startsWith('<!doctype html') || start.startsWith('<html')) return 'text/html';
  if (start.startsWith('<?xml')) return 'application/xml';
  return 'text/plain';
}
