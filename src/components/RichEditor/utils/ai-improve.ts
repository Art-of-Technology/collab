/**
 * Built-in AI improve functionality
 */
export async function builtInAiImprove(text: string): Promise<string> {
  if (!text.trim()) return text;

  try {
    const response = await fetch("/api/ai/improve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error("Failed to improve text");
    }

    const data = await response.json();
    const improvedText = data.message || data.improvedText || text;
    
    return improvedText;
  } catch (error) {
    console.error("Error improving text:", error);
    throw error;
  }
}

/**
 * Markdown parsing function for AI-improved text
 */
export function parseMarkdownToTipTap(markdown: string): string {
  // Simple markdown to HTML conversion
  let html = markdown
    // Bold: **text** or __text__
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_ (but avoid conflicts with bold)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
    // Headers
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr>')
    .replace(/^\*\*\*+$/gm, '<hr>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>')
    // Lists - numbered
    .replace(/^\d+\.\s+(.+)$/gm, '::OL::<li>$1</li>')
    // Lists - bulleted
    .replace(/^[\-\*\+]\s+(.+)$/gm, '::UL::<li>$1</li>')
    // Line breaks
    .replace(/\n/g, '<br>');
  
  // Process lists properly
  html = html
    // Group consecutive ordered list items
    .replace(/(::OL::<li>.*?<\/li>(<br>)?)+/g, (match) => {
      const items = match.replace(/::OL::/g, '').replace(/<br>/g, '');
      return `<ol>${items}</ol>`;
    })
    // Group consecutive unordered list items
    .replace(/(::UL::<li>.*?<\/li>(<br>)?)+/g, (match) => {
      const items = match.replace(/::UL::/g, '').replace(/<br>/g, '');
      return `<ul>${items}</ul>`;
    })
    // Clean up remaining markers
    .replace(/::OL::/g, '')
    .replace(/::UL::/g, '');
  
  // Clean up extra line breaks
  html = html
    .replace(/<br>\s*<\/h[123]>/g, '</h$1>')
    .replace(/<br>\s*<\/blockquote>/g, '</blockquote>')
    .replace(/<br>\s*<\/li>/g, '</li>')
    .replace(/<br>\s*<hr>/g, '<hr>')
    .replace(/(<\/(?:ol|ul|blockquote|h[123]|hr)>)\s*<br>/g, '$1');
  
  return html;
}
