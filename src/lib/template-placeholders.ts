/**
 * Template Placeholder Replacement Utility
 *
 * Handles replacement of template placeholders with actual values.
 */

export interface PlaceholderContext {
  date?: Date;
  projectName?: string;
  number?: number;
  title?: string;
  userName?: string;
  workspaceName?: string;
}

/**
 * Format date for template placeholders
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format time for template placeholders
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format datetime for template placeholders
 */
function formatDateTime(date: Date): string {
  return `${formatDate(date)}, ${formatTime(date)}`;
}

/**
 * Format number with leading zeros (e.g., 001, 012, 123)
 */
function formatNumber(num: number): string {
  return num.toString().padStart(3, '0');
}

/**
 * Replace all placeholders in a template string with actual values
 *
 * Supported placeholders:
 * - {{date}} - Current date (e.g., "January 15, 2026")
 * - {{time}} - Current time (e.g., "2:30 PM")
 * - {{datetime}} - Current date and time
 * - {{projectName}} - Name of the selected project
 * - {{number}} - Auto-incrementing number (for ADRs, etc.)
 * - {{title}} - User-provided title
 * - {{userName}} - Current user's name
 * - {{workspaceName}} - Current workspace name
 */
export function replacePlaceholders(template: string, context: PlaceholderContext): string {
  const now = context.date || new Date();

  let result = template;

  // Replace date/time placeholders
  result = result.replace(/\{\{date\}\}/gi, formatDate(now));
  result = result.replace(/\{\{time\}\}/gi, formatTime(now));
  result = result.replace(/\{\{datetime\}\}/gi, formatDateTime(now));

  // Replace context-specific placeholders
  if (context.projectName) {
    result = result.replace(/\{\{projectName\}\}/gi, context.projectName);
  }

  if (context.number !== undefined) {
    result = result.replace(/\{\{number\}\}/gi, formatNumber(context.number));
  }

  if (context.title) {
    result = result.replace(/\{\{title\}\}/gi, context.title);
  }

  if (context.userName) {
    result = result.replace(/\{\{userName\}\}/gi, context.userName);
  }

  if (context.workspaceName) {
    result = result.replace(/\{\{workspaceName\}\}/gi, context.workspaceName);
  }

  return result;
}

/**
 * Extract all unique placeholders from a template string
 * Returns an array of placeholder keys (without the {{ }} wrapper)
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  const placeholders = matches.map(match => match.replace(/\{\{|\}\}/g, '').toLowerCase());
  return [...new Set(placeholders)];
}

/**
 * Check if a template contains placeholders that require user input
 * Currently only {{title}} and {{number}} require explicit input
 */
export function hasRequiredPlaceholders(template: string): boolean {
  const placeholders = extractPlaceholders(template);
  const requiredPlaceholders = ['title', 'number'];
  return placeholders.some(p => requiredPlaceholders.includes(p));
}

/**
 * Get the required placeholders that need user input
 */
export function getRequiredPlaceholders(template: string): string[] {
  const placeholders = extractPlaceholders(template);
  const requiredPlaceholders = ['title', 'number'];
  return placeholders.filter(p => requiredPlaceholders.includes(p));
}

/**
 * Validate that all required placeholders have values in the context
 */
export function validateContext(template: string, context: PlaceholderContext): { valid: boolean; missing: string[] } {
  const required = getRequiredPlaceholders(template);
  const missing: string[] = [];

  for (const placeholder of required) {
    if (placeholder === 'title' && !context.title) {
      missing.push('title');
    }
    if (placeholder === 'number' && context.number === undefined) {
      missing.push('number');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Preview a template with placeholder values highlighted
 * Returns HTML with placeholders styled differently
 */
export function previewTemplateWithPlaceholders(template: string): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    '<span class="bg-primary/20 text-primary px-1 rounded font-mono text-sm">{{$1}}</span>'
  );
}
