"use client";

import { cn } from "@/lib/utils";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MarkdownContentProps {
  content?: string;     // Keep for potential fallback/compatibility
  htmlContent: string; // Make this the primary required prop
  className?: string;
  asSpan?: boolean;
}

export function MarkdownContent({ content, htmlContent, className, asSpan = false }: MarkdownContentProps) {
  const router = useRouter();

  // Determine the container element type
  const Container = asSpan ? 'span' : 'div';

  // Directly use htmlContent - no useEffect or processing needed here anymore
  // The mentions and formatting are already in the HTML string

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
    // Find the closest ancestor (or self) that is a mention block
    const mentionElement = target.closest('.mention-block');
    
    if (mentionElement) {
      const userId = mentionElement.getAttribute('data-user-id');
      if (userId) {
        // Prevent default link behavior if it was accidentally an 'a' tag somehow
        event.preventDefault();
        // *** Stop the event from bubbling up to parent handlers ***
        event.stopPropagation(); 
        // *** End Stop Propagation ***
        router.push(`/profile/${userId}`);
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
      // Directly render the HTML content
      dangerouslySetInnerHTML={{ __html: htmlContent || content || '' }} 
      onClick={handleClick}
    />
  );
} 