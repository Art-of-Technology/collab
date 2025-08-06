"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from "@/context/WorkspaceContext";

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
    if (processed.includes('@[') || processed.includes('~[') || processed.includes('^[') || processed.includes('![')) {
      // Convert text-based mentions to HTML spans
      
      // User mentions: @[name](id) -> HTML span
      processed = processed.replace(
        /@\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="mention-block" data-user-id="$2"><span class="mention-symbol">@</span>$1</span>'
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
      
      // Task mentions: #[name](id) -> HTML span
      processed = processed.replace(
        /#\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="task-mention" data-id="$2"><span class="mention-symbol">#</span>$1</span>'
      );
      
      // Convert newlines to <br> tags if needed
      if (processed.includes('\n') && !processed.includes('<br>')) {
        processed = processed.replace(/\n/g, '<br>');
      }
    }
    
    return processed;
  }, [htmlContent, content]);

  // Keep the CSS useEffect for styling the .mention-block class
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-markdown-content-css', '');
    style.textContent = `
      .mention-block {
        display: inline-flex;
        align-items: center;
        background-color: rgba(59, 130, 246, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #3b82f6;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
      }
      
      .mention-block:hover {
        text-decoration: underline;
      }
      
      .mention-block .mention-symbol {
        opacity: 0.7;
        margin-right: 0.125rem;
      }
      
      /* Epic, Story, Milestone mentions */
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
      
      .task-mention {
        display: inline-flex;
        align-items: center;
        background-color: rgba(59, 130, 246, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #3b82f6;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
      }
      
      .epic-mention:hover,
      .story-mention:hover,
      .milestone-mention:hover,
      .task-mention:hover {
        text-decoration: underline;
      }
      
      .epic-mention .mention-symbol,
      .story-mention .mention-symbol,
      .milestone-mention .mention-symbol,
      .task-mention .mention-symbol {
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
    const userMention = target.closest('.mention-block');
    const epicMention = target.closest('.epic-mention');
    const storyMention = target.closest('.story-mention');
    const milestoneMention = target.closest('.milestone-mention');
    const taskMention = target.closest('.task-mention');
    
    if (userMention) {
      const userId = userMention.getAttribute('data-user-id');
      if (userId && currentWorkspace) {
        event.preventDefault();
        event.stopPropagation();
        router.push(`/${currentWorkspace.id}/profile/${userId}`);
      }
    } else if (epicMention) {
      const epicId = epicMention.getAttribute('data-id');
      if (epicId && currentWorkspace) {
        event.preventDefault();
        event.stopPropagation();
        router.push(`/${currentWorkspace.id}/epics/${epicId}`);
      }
    } else if (storyMention) {
      const storyId = storyMention.getAttribute('data-id');
      if (storyId && currentWorkspace) {
        event.preventDefault();
        event.stopPropagation();
        router.push(`/${currentWorkspace.id}/stories/${storyId}`);
      }
    } else if (milestoneMention) {
      const milestoneId = milestoneMention.getAttribute('data-id');
      if (milestoneId && currentWorkspace) {
        event.preventDefault();
        event.stopPropagation();
        router.push(`/${currentWorkspace.id}/milestones/${milestoneId}`);
      }
    } else if (taskMention) {
      const taskId = taskMention.getAttribute('data-id');
      if (taskId && currentWorkspace) {
        event.preventDefault();
        event.stopPropagation();
        router.push(`/${currentWorkspace.id}/tasks/${taskId}`);
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
      dangerouslySetInnerHTML={{ __html: processedHtmlContent }} 
      onClick={handleClick}
    />
  );
} 