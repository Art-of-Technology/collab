/**
 * Extracts @mentions from text
 * @param text - The text to extract mentions from
 * @returns An array of usernames mentioned in the text
 */
export function extractMentions(text: string): string[] {
  // Handle both formats:
  // 1. Old format: @username (without spaces)
  // 2. New format: @[username with spaces](userId)
  
  const mentions = [];
  
  // Extract usernames from old format @username
  const oldFormatRegex = /@([a-zA-Z0-9_-]+)(?!\])/g;
  let match;
  while ((match = oldFormatRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  
  // Extract usernames from new format @[username with spaces](userId)
  const newFormatRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = newFormatRegex.exec(text)) !== null) {
    mentions.push(match[1]); // Push the username part including spaces
  }
  
  return mentions;
}

/**
 * Maximum input length to prevent ReDoS attacks
 */
const MAX_INPUT_LENGTH = 100000;

/**
 * Extracts user IDs from mentioned format OR HTML content.
 * @param text - The text (potentially HTML) to extract mention user IDs from.
 * @returns An array of user IDs mentioned in the text.
 */
export function extractMentionUserIds(text: string): string[] {
  if (!text) {
    return [];
  }

  // Prevent ReDoS by limiting input length
  const safeText = text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text;

  const userIds = new Set<string>(); // Use a Set to avoid duplicates

  // Extract mentions from HTML spans using a safer approach
  // Split by <span to process each potential mention span individually
  const spanParts = safeText.split(/<span\s+/i);
  for (let i = 1; i < spanParts.length; i++) {
    const part = spanParts[i];
    // Find the end of the opening tag (first >)
    const tagEndIndex = part.indexOf('>');
    if (tagEndIndex === -1) continue;
    
    const spanAttributes = part.slice(0, tagEndIndex);
    
    // Check if this looks like a mention span
    const isMention = 
      spanAttributes.includes('data-type="mention"') ||
      spanAttributes.includes("data-type='mention'") ||
      spanAttributes.includes('data-mention="true"') ||
      spanAttributes.includes("data-mention='true'") ||
      /class=["'][^"']*\bmention\b[^"']*["']/.test(spanAttributes);
    
    if (!isMention) continue;

    // Extract user ID using simple string matching first, then regex as fallback
    let userId: string | null = null;
    
    // Try data-user-id first
    const userIdMatch = spanAttributes.match(/data-user-id=["']([^"']+)["']/);
    if (userIdMatch) {
      userId = userIdMatch[1];
    } else {
      // Fallback to data-id
      const idMatch = spanAttributes.match(/data-id=["']([^"']+)["']/);
      if (idMatch) {
        userId = idMatch[1];
      }
    }
    
    if (userId) userIds.add(userId);
  }

  // Also check for the raw format @[username](userId) as a fallback
  // Use a more specific regex that limits the username and userId lengths to prevent ReDoS
  // Username: up to 100 chars, no ] allowed
  // UserId: up to 50 chars (UUIDs are 36 chars), no ) allowed
  const rawMentionRegex = /@\[([^\]]{1,100})\]\(([^)]{1,50})\)/g;
  let rawMatch: RegExpExecArray | null;
  while ((rawMatch = rawMentionRegex.exec(safeText)) !== null) {
    if (rawMatch[2]) userIds.add(rawMatch[2]);
  }
  
  return Array.from(userIds); // Convert Set back to Array
}

/**
 * Formats text to highlight mentions
 * @param text - The text containing mentions
 * @returns The text with HTML formatting for mentions
 */
export function formatMentions(text: string): string {
  if (!text) return "";
  
  // First, escape HTML special characters to prevent XSS
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  
  // Convert @[username](userId) to clickable HTML link with proper attributes
  formatted = formatted.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g, 
    (match, name, id) => {
      // Full match is processed as a single entity, preserving spaces
      return `<span class="mention" data-user-id="${id}" data-raw-mention="${match}" contenteditable="false"><span class="mention-symbol">@</span>${name}</span>`;
    }
  );
  
  // Also handle old format @username for backward compatibility
  formatted = formatted.replace(
    /@([a-zA-Z0-9_-]+)(?!\])/g, 
    '<span class="mention"><span class="mention-symbol">@</span>$1</span>'
  );
  
  // Replace newlines with <br> for proper display
  formatted = formatted.replace(/\n/g, '<br>');
  
  // If content is empty, show placeholder
  if (formatted === '') {
    return '<span class="text-muted-foreground">Write something...</span>';
  }
  
  return formatted;
}

/**
 * Creates data for a notification based on mention
 * @param mentionedUserId - The ID of the user being mentioned
 * @param currentUserId - The ID of the current user making the mention
 * @param sourceType - The type of content where the mention occurred
 * @param sourceId - The ID of the content where the mention occurred
 * @param sourceText - The text containing the mention for context
 * @returns Notification data object
 */
export function createMentionNotificationData(
  mentionedUserId: string,
  currentUserId: string,
  sourceType: 'post' | 'comment' | 'feature' | 'task' | 'epic' | 'story' | 'milestone',
  sourceId: string,
  sourceText: string
) {
  const notificationType = `${sourceType}_mention`;
  const contentPreview = sourceText.length > 100 
    ? `${sourceText.substring(0, 97)}...` 
    : sourceText;
  
  const content = `mentioned you in a ${sourceType}: "${contentPreview}"`;
  
  return {
    type: notificationType,
    content,
    userId: mentionedUserId,
    senderId: currentUserId,
    read: false,
    [`${sourceType}Id`]: sourceId,
  };
} 