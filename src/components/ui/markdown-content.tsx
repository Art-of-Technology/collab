"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from "@/context/WorkspaceContext";
import DOMPurify from 'dompurify';
interface MarkdownContentProps {
  content?: string;     // Keep for potential fallback/compatibility
  htmlContent: string; // Make this the primary required prop
  className?: string;
  asSpan?: boolean;
}

export function MarkdownContent({ content, htmlContent, className, asSpan = false }: MarkdownContentProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  // Determine the container element type
  const Container = asSpan ? 'span' : 'div';

  // Process htmlContent to convert text-based mentions to HTML if needed
  const processedHtmlContent = useMemo(() => {
    if (!htmlContent) return content || '';
    
    let processed = htmlContent;
    
    // If content looks like text (contains mention patterns but not HTML), process it
    if (processed.includes('@[') || processed.includes('#[') || processed.includes('~[') || processed.includes('^[') || processed.includes('![')) {
      // Convert text-based mentions to HTML spans
      
      // User mentions: @[name](id) -> clickable mention
      processed = processed.replace(
        /@\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="mention mention-link" data-user-id="$2"><span class="mention-symbol">@</span>$1</span>'
      );
      
      // Epic mentions: ~[name](id) -> HTML span  
      processed = processed.replace(
        /~\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="epic-mention" data-id="$2"><span class="mention-symbol">~</span>$1</span>'
      );
      
      // Story mentions: ^[name](id) -> HTML span
      processed = processed.replace(
        /\^\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="story-mention" data-id="$2"><span class="mention-symbol">^</span>$1</span>'
      );
      
      // Milestone mentions: ![name](id) -> HTML span  
      processed = processed.replace(
        /!\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="milestone-mention" data-id="$2"><span class="mention-symbol">!</span>$1</span>'
      );
      
      // Issue mentions: #[key](id) -> clickable mention span (routing handled via onClick)
      processed = processed.replace(
        /#\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="mention mention-link" data-issue-id="$2"><span class="mention-symbol">#</span>$1</span>'
      );
      
      // Convert newlines to <br> tags if needed
      if (processed.includes('\n') && !processed.includes('<br>')) {
        processed = processed.replace(/\n/g, '<br>');
      }
    }
    
    return processed;
  }, [htmlContent, content]);

  // Sanitize the processed HTML content before rendering
  const sanitizedHtmlContent = useMemo(() => {
    return DOMPurify.sanitize(processedHtmlContent);
  }, [processedHtmlContent]);

  // Keep the CSS useEffect for styling the .mention-block class
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-markdown-content-css', '');
    style.textContent = `
      .mention-link {
        display: inline-flex;
        align-items: center;
        background-color: rgba(31, 41, 55, 0.45);
        color: rgba(255, 255, 255, 0.95);
        border-radius: 3px;
        padding: 0.05rem 0.25rem;
        margin: 0 1px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.18s ease;
        border: 1px solid rgba(55, 65, 81, 0.4);
        line-height: 1.2;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
        text-decoration: none;
        pointer-events: auto;
      }
      
      .mention-link:hover {
        background-color: rgba(55, 65, 81, 0.7);
        color: #fff;
        border-color: rgba(75, 85, 99, 0.5);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(34, 197, 94, 0.2);
        transform: translateY(-1px);
      }
      
      .mention-link .mention-symbol {
        color: hsl(var(--primary));
        font-weight: 600;
        margin-right: 0.1rem;
      }

      /* Epic, Story, Milestone, Issue mentions */
      .epic-mention {
        display: inline-flex;
        align-items: center;
        background-color: rgba(168, 85, 247, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #a855f7;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
      }
      
      .story-mention {
        display: inline-flex;
        align-items: center;
        background-color: rgba(34, 197, 94, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #22c55e;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
      }
      
      .milestone-mention {
        display: inline-flex;
        align-items: center;
        background-color: rgba(245, 158, 11, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #f59e0b;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
      }
      
      .issue-mention {
        display: inline-flex;
        align-items: center;
        background-color: rgba(34, 197, 94, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #22c55e;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
      }
      
      .epic-mention:hover,
      .story-mention:hover,
      .milestone-mention:hover,
      .issue-mention:hover {
        text-decoration: underline;
      }
      
      .epic-mention .mention-symbol,
      .story-mention .mention-symbol,
      .milestone-mention .mention-symbol,
      .issue-mention .mention-symbol {
        opacity: 0.7;
        margin-right: 0.125rem;
      }
    `;
    
    if (!document.querySelector('[data-markdown-content-css]')) {
      document.head.appendChild(style);
    }
    
    return () => {
      if (document.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);
  
  // Click handler for event delegation
  const handleClick = (event: React.MouseEvent<HTMLDivElement | HTMLSpanElement>) => {
    const target = event.target as HTMLElement;

    // Check for different types of mentions
    const userMention = target.closest('.mention-link[data-user-id]') as HTMLElement | null;
    const issueMention = target.closest('.mention-link[data-issue-id]') as HTMLElement | null;

    if (userMention && currentWorkspace) {
      const userId = userMention.getAttribute('data-user-id');
      if (userId) {
        event.preventDefault();
        event.stopPropagation();
        const workspaceSegment = currentWorkspace.slug || currentWorkspace.id;
        router.push(`/${workspaceSegment}/profile/${userId}`);
      }
    } else if (issueMention && currentWorkspace) {
      const issueId = issueMention.getAttribute('data-issue-id');
      if (issueId) {
        event.preventDefault();
        event.stopPropagation();
        const workspaceSegment = currentWorkspace.slug || currentWorkspace.id;
        router.push(`/${workspaceSegment}/issues/${issueId}`);
      }
    }
  };
  
  return (
    <Container 
      className={cn(
        !asSpan && "prose prose-sm dark:prose-invert max-w-full",
        !asSpan && "prose-headings:mt-2 prose-headings:mb-1 prose-headings:font-semibold prose-p:my-1.5",
        !asSpan && "prose-pre:bg-muted prose-pre:text-muted-foreground prose-pre:p-2 prose-pre:rounded-md",
        !asSpan && "prose-code:text-primary prose-code:font-medium",
        !asSpan && "prose-img:my-1 prose-img:rounded-md",
        !asSpan && "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:my-1",
        className
      )}
      // Render the processed HTML content
      dangerouslySetInnerHTML={{ __html: sanitizedHtmlContent }} 
      onClick={handleClick}
    />
  );
} 