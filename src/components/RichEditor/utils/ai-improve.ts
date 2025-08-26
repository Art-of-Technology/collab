/**
 * Convert TipTap nodes to markdown format
 */
export function extractSelectionAsMarkdown(editor: any, from: number, to: number): string {
  if (!editor || from === to) return '';
  
  const selectedSlice = editor.state.doc.slice(from, to);
  let markdown = '';
  
  const processNode = (node: any, depth = 0): string => {
    let result = '';
    
    if (node.isText) {
      let text = node.text || '';
      
      // Apply text formatting marks
      if (node.marks) {
        for (const mark of node.marks) {
          switch (mark.type.name) {
            case 'bold':
            case 'strong':
              text = `**${text}**`;
              break;
            case 'italic':
            case 'em':
              text = `*${text}*`;
              break;
            case 'code':
              text = `\`${text}\``;
              break;
            case 'strike':
              text = `~~${text}~~`;
              break;
            case 'underline':
              text = `<u>${text}</u>`; // Markdown doesn't have native underline
              break;
            case 'link':
              const href = mark.attrs?.href || '#';
              text = `[${text}](${href})`;
              break;
          }
        }
      }
      
      return text;
    }
    
    if (node.isBlock) {
      switch (node.type.name) {
        case 'heading':
          const level = node.attrs?.level || 1;
          const headingPrefix = '#'.repeat(level);
          const headingText = node.content ? 
            node.content.content.map((child: any) => processNode(child, depth + 1)).join('') : '';
          result = `${headingPrefix} ${headingText}\n\n`;
          break;
          
        case 'paragraph':
          if (node.content && node.content.content.length > 0) {
            const paragraphText = node.content.content.map((child: any) => processNode(child, depth + 1)).join('');
            result = `${paragraphText}\n\n`;
          } else {
            result = '\n';
          }
          break;
          
        case 'blockquote':
          const quoteText = node.content ? 
            node.content.content.map((child: any) => processNode(child, depth + 1)).join('') : '';
          result = `> ${quoteText}\n\n`;
          break;
          
        case 'codeBlock':
          const codeText = node.content ? 
            node.content.content.map((child: any) => processNode(child, depth + 1)).join('') : '';
          const language = node.attrs?.language || '';
          result = `\`\`\`${language}\n${codeText}\n\`\`\`\n\n`;
          break;
          
        case 'bulletList':
          if (node.content) {
            result = node.content.content.map((listItem: any) => {
              const itemText = listItem.content ? 
                listItem.content.content.map((child: any) => processNode(child, depth + 1)).join('') : '';
              return `- ${itemText.trim()}`;
            }).join('\n') + '\n\n';
          }
          break;
          
        case 'orderedList':
          if (node.content) {
            result = node.content.content.map((listItem: any, index: number) => {
              const itemText = listItem.content ? 
                listItem.content.content.map((child: any) => processNode(child, depth + 1)).join('') : '';
              return `${index + 1}. ${itemText.trim()}`;
            }).join('\n') + '\n\n';
          }
          break;
          
        case 'horizontalRule':
          result = '---\n\n';
          break;
          
        default:
          // For unknown block nodes, try to process their content
          if (node.content) {
            result = node.content.content.map((child: any) => processNode(child, depth + 1)).join('');
          }
      }
    }
    
    // Handle inline nodes
    if (node.isInline) {
      switch (node.type.name) {
        case 'hardBreak':
          result = '\n';
          break;
        case 'mention':
          const mentionLabel = node.attrs?.label || 'Unknown';
          result = `@${mentionLabel}`;
          break;
        case 'issueMention':
          const issueLabel = node.attrs?.label || 'Unknown';
          result = `#${issueLabel}`;
          break;
        default:
          // For other inline nodes, try to process their content
          if (node.content) {
            result = node.content.content.map((child: any) => processNode(child, depth + 1)).join('');
          }
      }
    }
    
    return result;
  };
  
  // Process all nodes in the selected slice
  if (selectedSlice.content && selectedSlice.content.content) {
    markdown = selectedSlice.content.content.map((node: any) => processNode(node)).join('');
  }
  
  // Clean up extra newlines
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  
  return markdown;
}

/**
 * Built-in AI improve functionality
 */
export async function builtInAiImprove(text: string): Promise<string> {
  if (!text.trim()) return text;

  try {
    console.log('builtInAiImprove: Sending request to API with text:', text);
    
    const response = await fetch("/api/ai/improve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    console.log('builtInAiImprove: API response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('builtInAiImprove: API error response:', errorData);
      throw new Error(`API request failed: ${response.status} - ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    console.log('builtInAiImprove: API response data:', data);
    
    // Check if we have a valid improved text
    if (!data.message && !data.improvedText) {
      console.error('builtInAiImprove: No improved text in response');
      throw new Error("No improved text received from API");
    }
    
    const improvedText = data.message || data.improvedText;
    
    // Check if the improved text is different from the original
    if (improvedText === text) {
      console.warn('builtInAiImprove: API returned the same text as input');
    }
    
    console.log('builtInAiImprove: Returning improved text:', improvedText);
    return improvedText;
  } catch (error) {
    console.error("builtInAiImprove: Error improving text:", error);
    throw error;
  }
}

/**
 * Enhanced markdown parsing function for AI-improved text
 */
export function parseMarkdownToTipTap(markdown: string): string {
  if (!markdown || !markdown.trim()) return '';
  
  console.log('parseMarkdownToTipTap: Input markdown:', markdown);
  
  // Check if this is just simple text without any markdown formatting
  const hasMarkdownFormatting = /[*_#>`\[\]()~-]|^[\s]*[-*+]|^\d+\./.test(markdown);
  if (!hasMarkdownFormatting && !markdown.includes('\n\n')) {
    console.log('parseMarkdownToTipTap: Simple text detected, returning as-is');
    return markdown.trim();
  }
  
  // First, normalize line endings and clean up
  let html = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  // Process markdown elements in order of precedence
  
  // Code blocks (must be processed before inline code)
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || '';
    return `<pre><code class="language-${language}">${code.trim()}</code></pre>`;
  });
  
  // Inline code (after code blocks)
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  
  // Headers (process from h6 to h1 to avoid conflicts)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  
  // Bold and italic (process bold first to avoid conflicts)
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>'); // Bold + italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>'); // Bold alternative
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>'); // Italic
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>'); // Italic alternative
  
  // Strikethrough
  html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
  
  // Underline (HTML tag, not standard markdown)
  html = html.replace(/<u>(.*?)<\/u>/g, '<u>$1</u>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Images (if needed)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/^\*\*\*+$/gm, '<hr>');
  html = html.replace(/^___+$/gm, '<hr>');
  
  // Blockquotes (support nested quotes)
  html = html.replace(/^>\s+(.+)$/gm, '::QUOTE::$1');
  html = html.replace(/(::QUOTE::.+(?:\n::QUOTE::.+)*)/g, (match) => {
    const content = match.replace(/::QUOTE::/g, '').replace(/\n/g, '<br>');
    return `<blockquote><p>${content}</p></blockquote>`;
  });
  
  // Lists - Process ordered lists first
  html = html.replace(/^\d+\.\s+(.+)$/gm, '::OL::$1');
  html = html.replace(/^[-*+]\s+(.+)$/gm, '::UL::$1');
  
  // Group consecutive list items
  html = html.replace(/(::OL::.+(?:\n::OL::.+)*)/g, (match) => {
    const items = match.split('\n').map(line => {
      const content = line.replace(/::OL::/, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ol>${items}</ol>`;
  });
  
  html = html.replace(/(::UL::.+(?:\n::UL::.+)*)/g, (match) => {
    const items = match.split('\n').map(line => {
      const content = line.replace(/::UL::/, '');
      return `<li>${content}</li>`;
    }).join('');
    return `<ul>${items}</ul>`;
  });
  
  // Clean up any remaining markers
  html = html.replace(/::OL::/g, '').replace(/::UL::/g, '').replace(/::QUOTE::/g, '');
  
  // Handle paragraph breaks more conservatively
  const paragraphs = html.split(/\n\s*\n/);
  
  // Only wrap in paragraphs if we have multiple paragraphs or if the content clearly needs it
  if (paragraphs.length > 1) {
    html = paragraphs.map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      
      // Don't wrap block elements in paragraphs
      if (trimmed.match(/^<(h[1-6]|blockquote|pre|ul|ol|hr|div)/)) {
        return trimmed;
      }
      
      // Only wrap in paragraphs if we have multiple paragraphs
      return `<p>${trimmed}</p>`;
    }).filter(p => p).join('');
  } else {
    // Single paragraph - don't add paragraph wrapper unless it's clearly needed
    const trimmed = html.trim();
    
    // If it's already a block element, don't wrap
    if (trimmed.match(/^<(h[1-6]|blockquote|pre|ul|ol|hr|div|p)/)) {
      html = trimmed;
    } else {
      // For simple text content, don't add paragraph wrapper to avoid extra spacing
      html = trimmed;
    }
  }
  
  // Handle remaining single line breaks more carefully
  html = html.replace(/\n(?!<)/g, '<br>');
  
  // Final cleanup
  html = html
    .replace(/<br>\s*<\/(h[1-6]|blockquote|li|p)>/g, '</$1>')
    .replace(/(<\/(?:h[1-6]|blockquote|ul|ol|hr|div)>)\s*<br>/g, '$1')
    .replace(/(<(h[1-6]|blockquote|ul|ol|hr|div)[^>]*>)\s*<br>/g, '$1');
  
  console.log('parseMarkdownToTipTap: Output HTML:', html);
  
  return html;
}
