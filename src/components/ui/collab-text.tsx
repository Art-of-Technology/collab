"use client"

import { cn } from "@/lib/utils"

interface CollabTextProps {
  content: string
  className?: string
  title?: string
  small?: boolean
  withBackground?: boolean
  asSpan?: boolean
}

export function CollabText({ 
  content, 
  className, 
  title,
  small = false,
  withBackground = false,
  asSpan = false
}: CollabTextProps) {
  // Parse and format the content with mentions
  const formatTextWithMentions = () => {
    if (!content) return { __html: "" }
    
    // Escape HTML special characters to prevent XSS
    let formatted = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
    
    // Convert @[username](userId) to clickable links
    formatted = formatted.replace(
      /@\[([^\]]+)\]\(([^)]+)\)/g,
      (_, name, id) => {
        return `<a href="/profile/${id}" class="mention mention-link" data-user-id="${id}"><span class="mention-symbol">@</span>${name}</a>`
      }
    )
    
    // Handle old format @username
    formatted = formatted.replace(
      /@([a-zA-Z0-9_-]+)(?!\])/g,
      '<span class="mention"><span class="mention-symbol">@</span>$1</span>'
    )
    
    // Convert #[issueKey](issueId) to styled span (avoid href to prevent wrong routing context)
    formatted = formatted.replace(
      /#\[([^\]]+)\]\(([^)]+)\)/g,
      (_, key, id) => {
        return `<span class="mention mention-link" data-issue-id="${id}"><span class="mention-symbol">#</span>${key}</span>`
      }
    )
    
    // Convert newlines to <br> tags
    formatted = formatted.replace(/\n/g, '<br />')
    
    return { __html: formatted }
  }
  
  const Container = asSpan ? 'span' : 'div';
  const ContentContainer = asSpan ? 'span' : 'div';
  
  return (
    <Container className={cn(
      "collab-text",
      small ? "text-sm" : "",
      withBackground ? "p-3 rounded-md bg-card/40 border border-border/30" : "",
      className
    )}>
      {title && <h3 className="font-medium mb-2">{title}</h3>}
      <ContentContainer dangerouslySetInnerHTML={formatTextWithMentions()} />
    </Container>
  )
}

/**
 * Usage Example:
 * 
 * ```tsx
 * <CollabText
 *   content="Hey @[John Doe](user_123), check out this feature!"
 *   title="Comment from Admin"
 *   small
 *   withBackground
 * />
 * 
 * // When inside a <p> tag, use asSpan:
 * <p>
 *   <CollabText
 *     content="Hey @[John Doe](user_123), check out this feature!"
 *     asSpan
 *   />
 * </p>
 * ```
 */

// Add CSS to global.css:
// 
// .mention-link {
//   display: inline-flex;
//   align-items: center;
//   background-color: rgba(31, 41, 55, 0.45);
//   color: rgba(255, 255, 255, 0.95);
//   border-radius: 3px;
//   padding: 0.05rem 0.25rem;
//   margin: 0 1px;
//   font-size: 0.875rem;
//   font-weight: 500;
//   cursor: pointer;
//   transition: all 0.18s ease;
//   border: 1px solid rgba(55, 65, 81, 0.4);
//   line-height: 1.2;
//   box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
//   text-decoration: none;
//   pointer-events: auto;
// }
// 
// .mention-link:hover {
//   background-color: rgba(55, 65, 81, 0.7);
//   color: #fff;
//   border-color: rgba(75, 85, 99, 0.5);
//   box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(34, 197, 94, 0.2);
//   transform: translateY(-1px);
// } 