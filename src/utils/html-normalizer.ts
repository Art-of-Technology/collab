/**
 * Normalizes HTML content by removing leading/trailing empty paragraphs
 * and excessive whitespace while preserving valid formatting.
 * 
 * This function is idempotent - applying it multiple times produces the same result.
 * 
 * @param html - The HTML string to normalize
 * @returns Normalized HTML string with empty paragraphs removed
 */
export function normalizeDescriptionHTML(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Trim leading/trailing whitespace from the HTML string itself
  let normalized = html.trim();

  // If empty after trimming, return empty string
  if (!normalized) {
    return '';
  }

  // Remove leading empty paragraphs (including multiple consecutive ones)
  // Match: <p></p>, <p><br></p>, <p><br/></p>, <p> </p>, <p>&nbsp;</p>, etc.
  normalized = normalized.replace(/^(<p[^>]*>[\s\u00A0]*<\/p>\s*)+/gi, '');
  normalized = normalized.replace(/^(<p[^>]*><br\s*\/?><\/p>\s*)+/gi, '');
  
  // Remove trailing empty paragraphs (including multiple consecutive ones)
  normalized = normalized.replace(/(<p[^>]*>[\s\u00A0]*<\/p>\s*)+$/gi, '');
  normalized = normalized.replace(/(<p[^>]*><br\s*\/?><\/p>\s*)+$/gi, '');

  // Normalize excessive empty paragraphs between content blocks
  // Preserve 1-4 empty paragraphs (intended spacing), reduce 5+ to 4 empty paragraphs
  normalized = normalized.replace(/(<\/p>)\s*((?:<p[^>]*>[\s\u00A0]*<\/p>\s*){5,})(<p[^>]*>)/gi, '$1<p></p>\n<p></p>\n<p></p>\n<p></p>\n$3');
  normalized = normalized.replace(/(<\/p>)\s*((?:<p[^>]*><br\s*\/?><\/p>\s*){5,})(<p[^>]*>)/gi, '$1<p><br></p>\n<p><br></p>\n<p><br></p>\n<p><br></p>\n$3');


  // Final trim to remove any remaining whitespace
  normalized = normalized.trim();

  // If we've removed everything, return empty string
  if (!normalized || normalized === '<p></p>' || normalized === '<p><br></p>' || normalized === '<p><br/></p>') {
    return '';
  }

  return normalized;
}

