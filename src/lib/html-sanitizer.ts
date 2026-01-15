/**
 * Safely strip all HTML tags from a string using a linear-time character parser.
 * This approach avoids regex-based vulnerabilities (ReDoS) by processing
 * the string character by character in O(n) time.
 *
 * Handles nested/malformed tags that could bypass single-pass regex
 * (e.g., <scr<script>ipt> which would become <script> after one pass)
 */
export function stripHtmlTags(html: string, decodeEntities: boolean = true): string {
  let result = "";
  let inTag = false;
  let tagDepth = 0;

  // First pass: Remove all HTML tags using a state machine approach (O(n))
  for (let i = 0; i < html.length; i++) {
    const char = html[i];

    if (char === "<") {
      inTag = true;
      tagDepth++;
    } else if (char === ">" && inTag) {
      inTag = false;
      tagDepth = Math.max(0, tagDepth - 1);
    } else if (!inTag && tagDepth === 0) {
      result += char;
    }
  }

  // Second pass: Handle any remaining unclosed tags by stripping again
  // This catches nested patterns like <scr<script>ipt> that become <script> after first pass
  if (result.includes("<")) {
    let cleaned = "";
    inTag = false;
    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      if (char === "<") {
        inTag = true;
      } else if (char === ">" && inTag) {
        inTag = false;
      } else if (!inTag) {
        cleaned += char;
      }
    }
    result = cleaned;
  }

  // Optionally decode common HTML entities
  // IMPORTANT: Decode &amp; LAST to prevent double-unescaping
  // (e.g., &amp;lt; -> &lt; -> < would be a security issue)
  if (decodeEntities) {
    result = result
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, "&"); // Must be last to prevent double-unescaping
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
