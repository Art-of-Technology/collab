"use client";

import React, { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/context/WorkspaceContext';

interface RichTextRendererProps {
  content: string;
  className?: string;
}

export function RichTextRenderer({ content, className }: RichTextRendererProps) {
  const { currentWorkspace } = useWorkspace();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleIssueMentionClick = useCallback(async (issueKey: string) => {
    try {
      const response = await fetch(`/api/issues/resolve?issueKey=${encodeURIComponent(issueKey)}`);

      if (response.ok) {
        const data = await response.json();
        const workspaceSlug = data.workspace?.slug;

        if (workspaceSlug) {
          const issueUrl = `/${workspaceSlug}/issues/${issueKey}`;
          window.open(issueUrl, '_blank');
        } else {
          // Fallback to current workspace
          const fallbackUrl = `/${currentWorkspace?.slug || currentWorkspace?.id}/issues/${issueKey}`;
          window.open(fallbackUrl, '_blank');
        }
      } else {
        // Fallback to current workspace
        const fallbackUrl = `/${currentWorkspace?.slug || currentWorkspace?.id}/issues/${issueKey}`;
        window.open(fallbackUrl, '_blank');
      }
    } catch (error) {
      console.error('Error resolving issue:', error);
      // Fallback to current workspace
      const fallbackUrl = `/${currentWorkspace?.slug || currentWorkspace?.id}/issues/${issueKey}`;
      window.open(fallbackUrl, '_blank');
    }
  }, [currentWorkspace?.slug, currentWorkspace?.id]);

  useEffect(() => {
    const handleMentionClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const mentionElement = target.closest('[data-type="mention"], [data-type="issue-mention"]') as HTMLElement | null;

      if (mentionElement && containerRef.current?.contains(mentionElement)) {
        // prevent default text selection behavior
        event.preventDefault();
        event.stopPropagation();
        (event as any).stopImmediatePropagation?.();

        const dataType = mentionElement.getAttribute('data-type');

        if (dataType === 'mention') {
          const userId = mentionElement.getAttribute('data-user-id') || mentionElement.getAttribute('data-id');
          if (userId && currentWorkspace?.slug) {
            const profileUrl = `/${currentWorkspace.slug}/profile/${userId}`;
            window.open(profileUrl, '_blank');
          }
          return;
        }

        if (dataType === 'issue-mention') {
          const issueKey = mentionElement.getAttribute('data-issue-key') || mentionElement.getAttribute('data-label');

          if (issueKey) {
            // Resolve the issue to its correct workspace
            handleIssueMentionClick(issueKey);
          }
        }
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('click', handleMentionClick, true);

      return () => {
        container.removeEventListener('click', handleMentionClick, true);
      };
    }
  }, [currentWorkspace?.slug, handleIssueMentionClick]);

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none",
          "text-[#e6edf3] prose-headings:text-white prose-strong:text-white",
          "prose-code:text-[#e6edf3] prose-code:bg-[#1a1a1a] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
          "prose-blockquote:border-l-[#444] prose-blockquote:text-[#9ca3af]",
          "prose-hr:border-[#333]",
          "prose-ul:text-[#e6edf3] prose-ol:text-[#e6edf3] prose-li:text-[#e6edf3]",
          "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300",
          className
        )}
        dangerouslySetInnerHTML={{ __html: content }}
      />

      {/* Global CSS for mention styling - same as RichEditor */}
      <style jsx global>{`
        /* Ensure inner elements don't steal click events */
        .mention *,
        .issue-mention * {
          pointer-events: none;
        }
        
        /* Ensure mention badges are clickable */
        .mention,
        .issue-mention {
          pointer-events: auto;
          user-select: none;
        }
        
        /* Mention badge hover effects */
        .mention,
        .issue-mention {
          position: relative;
          transition: all 0.2s ease;
          overflow: hidden;
        }
        
        .mention:hover,
        .issue-mention:hover {
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        /* External link icon animations */
        .mention-external-icon,
        .issue-mention-external-icon {
          width: 0;
          opacity: 0;
          transition: all 0.2s ease;
          overflow: hidden;
          margin-left: 0;
          display: inline-block;
        }
        
        .mention:hover .mention-external-icon,
        .issue-mention:hover .issue-mention-external-icon {
          width: 10px;
          opacity: 1;
          margin-left: 4px;
        }
        
        /* Video wrapper styles */
        .video-resizable-container {
          position: relative;
          display: inline-block;
          max-width: 100%;
          margin: 1rem 0;
          line-height: 0;
        }
        
        .video-resizable-container .resizable-video,
        .video-resizable-container video {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          transition: box-shadow 0.2s ease;
          margin:0;
        }
        
        .video-resizable-container:hover .resizable-video,
        .video-resizable-container:hover video {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </>
  );
}
