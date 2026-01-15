/**
 * Safely strip all HTML tags from a string using iterative approach.
 * Handles nested/malformed tags that could bypass single-pass regex
 * (e.g., <scr<script>ipt> which would become <script> after one pass)
 */
export function stripHtmlTags(html: string, decodeEntities: boolean = true): string {
  let result = html;
  let previous = "";

  // Keep stripping tags until no more changes occur
  while (result !== previous) {
    previous = result;
    result = result.replace(/<[^>]*>/g, "");
  }

  // Optionally decode common HTML entities
  if (decodeEntities) {
    result = result
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  return result;
}

export function sanitizeHtmlToPlainText(input: unknown): string {
  if (typeof input !== 'string') return '';
  let sanitized = input;
  // Strip HTML tags safely (handles nested/malformed tags)
  sanitized = stripHtmlTags(sanitized);
  // Normalize mention tokens like @[Full Name](...) -> @First
  sanitized = sanitized.replaceAll(/@\[([^\]]+)\]\([^\)]+\)/g, (_m, name: string) => {
    const first = String(name).trim().split(/\s+/)[0] || name;
    return `@${first}`;
  });
  // Normalize issue tokens like #[KEY](...) -> #KEY
  sanitized = sanitized.replaceAll(/#\[([^\]]+)\]\([^\)]+\)/g, (_m, key: string) => {
    return `#${String(key).trim()}`;
  });
  // Collapse whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  return sanitized;
}
