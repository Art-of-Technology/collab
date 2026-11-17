import { getDocumentProxy } from 'unpdf';

/** Read embedded text only; scans, encrypted and malformed PDFs have no text result. */
export async function pdfText(bytes: Uint8Array, limit: number): Promise<{ text: string; truncated: boolean } | null> {
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) return null;
  let document: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    document = await getDocumentProxy(new Uint8Array(bytes), {
      useSystemFonts: false, disableFontFace: true,
      maxImageSize: 0, verbosity: 0,
    });
    let text = '';
    let remaining = limit;
    const pages = Math.min(document.numPages, 100);
    for (let number = 1; number <= pages; number++) {
      const page = await document.getPage(number);
      const stream = page.streamTextContent();
      const reader = stream.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          for (const item of chunk.value.items) {
            if (!('str' in item)) continue;
            const piece = item.str + (item.hasEOL ? '\n' : ' ');
            const encoded = Buffer.from(piece);
            if (encoded.length > remaining) {
              // Decode only complete UTF-8 characters at the byte boundary.
              text += new TextDecoder().decode(encoded.subarray(0, remaining), { stream: true });
              return { text: text.trim(), truncated: true };
            }
            text += piece;
            remaining -= encoded.length;
          }
        }
      } finally {
        await reader.cancel(new Error('Text budget reached'));
        page.cleanup();
      }
      if (number < pages && remaining >= 2) { text += '\n\n'; remaining -= 2; }
    }
    return text.trim() ? { text: text.trim(), truncated: document.numPages > pages } : null;
  } catch {
    return null;
  } finally {
    await document?.loadingTask.destroy();
  }
}
