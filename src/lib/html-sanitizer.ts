export function sanitizeHtmlToPlainText(input: unknown): string {
  if (typeof input !== 'string') return '';
  let sanitized = input;
  // Strip HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  // Normalize mention tokens like @[Full Name](...) -> @First
  sanitized = sanitized.replaceAll(/@\[([^\]]+)\]\([^\)]+\)/g, (_m, name: string) => {
    const first = String(name).trim().split(/\s+/)[0] || name;
    return `@${first}`;
  });
  // Collapse whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  return sanitized;
}
