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

  const openImageInNewTab = useCallback((imageSrc: string) => {
    // Check if it's a base64 data URL
    if (imageSrc.startsWith('data:')) {
      try {
        // Parse the data URL
        const [header, base64Data] = imageSrc.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

        // Convert base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create blob from binary data
        const blob = new Blob([bytes], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);

        const newWindow = window.open(blobUrl, '_blank');
        if (newWindow) {
          // Clean up blob URL after a delay to allow the browser to load it
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 100);
        } else {
          // If popup was blocked, clean up immediately
          URL.revokeObjectURL(blobUrl);
        }
      } catch (error) {
        // Fallback: try opening data URL directly
        window.open(imageSrc, '_blank');
      }
    } else {
      // Regular URL - open directly
      window.open(imageSrc, '_blank');
    }
  }, []);

  useEffect(() => {
    const handleMentionClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if clicked element is an image
      if (target.tagName === 'IMG' && containerRef.current?.contains(target)) {
        const imageSrc = target.getAttribute('src');
        if (imageSrc) {
          event.preventDefault();
          event.stopPropagation();
          openImageInNewTab(imageSrc);
          return;
        }
      }

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
  }, [currentWorkspace?.slug, handleIssueMentionClick, openImageInNewTab]);

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none",
          "text-[#e6edf3] prose-headings:text-white prose-strong:text-white",
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
        
        /* Make images clickable */
        .prose img {
          cursor: pointer;
          transition: opacity 0.2s ease;
        }
        
        .prose img:hover {
          opacity: 0.9;
        }
        
        /* Code block highlighting styles */
        .prose :first-child,
        .tiptap :first-child {
          margin-top: 0;
        }
        
        .prose pre,
        .tiptap pre {
          background: #000000;
          border-radius: 0.5rem;
          color: #ffffff;
          font-family: 'JetBrainsMono', monospace;
          margin: 1.5rem 0;
          padding: 0.75rem 1rem;
        }
        
        .prose pre code,
        .tiptap pre code {
          background: none;
          color: inherit;
          font-size: 0.8rem;
          padding: 0;
        }
        
        /* Code syntax highlighting */
        .prose pre .hljs-comment,
        .prose pre .hljs-quote,
        .tiptap pre .hljs-comment,
        .tiptap pre .hljs-quote {
          color: #616161;
        }
        
        .prose pre .hljs-variable,
        .prose pre .hljs-template-variable,
        .prose pre .hljs-attribute,
        .prose pre .hljs-tag,
        .prose pre .hljs-regexp,
        .prose pre .hljs-link,
        .prose pre .hljs-name,
        .prose pre .hljs-selector-id,
        .prose pre .hljs-selector-class,
        .tiptap pre .hljs-variable,
        .tiptap pre .hljs-template-variable,
        .tiptap pre .hljs-attribute,
        .tiptap pre .hljs-tag,
        .tiptap pre .hljs-regexp,
        .tiptap pre .hljs-link,
        .tiptap pre .hljs-name,
        .tiptap pre .hljs-selector-id,
        .tiptap pre .hljs-selector-class {
          color: #f98181;
        }
        
        .prose pre .hljs-number,
        .prose pre .hljs-meta,
        .prose pre .hljs-built_in,
        .prose pre .hljs-builtin-name,
        .prose pre .hljs-literal,
        .prose pre .hljs-type,
        .prose pre .hljs-params,
        .tiptap pre .hljs-number,
        .tiptap pre .hljs-meta,
        .tiptap pre .hljs-built_in,
        .tiptap pre .hljs-builtin-name,
        .tiptap pre .hljs-literal,
        .tiptap pre .hljs-type,
        .tiptap pre .hljs-params {
          color: #fbbc88;
        }
        
        .prose pre .hljs-string,
        .prose pre .hljs-symbol,
        .prose pre .hljs-bullet,
        .tiptap pre .hljs-string,
        .tiptap pre .hljs-symbol,
        .tiptap pre .hljs-bullet {
          color: #b9f18d;
        }
        
        .prose pre .hljs-title,
        .prose pre .hljs-section,
        .tiptap pre .hljs-title,
        .tiptap pre .hljs-section {
          color: #faf594;
        }
        
        .prose pre .hljs-keyword,
        .prose pre .hljs-selector-tag,
        .tiptap pre .hljs-keyword,
        .tiptap pre .hljs-selector-tag {
          color: #70cff8;
        }
        
        .prose pre .hljs-emphasis,
        .tiptap pre .hljs-emphasis {
          font-style: italic;
        }
        
        .prose pre .hljs-strong,
        .tiptap pre .hljs-strong {
          font-weight: 700;
        }
      `}</style>
    </>
  );
}
