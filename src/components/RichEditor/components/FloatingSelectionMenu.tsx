import React, { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  WandSparkles,
  Loader2,
  GitBranch,
  FileCode,
  Link as LinkIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingSelectionMenuProps {
  editor: any;
  isVisible: boolean;
  position: { top: number; left: number };
  onAiImprove?: () => void;
  onCreateSubIssue?: () => void;
  isImproving?: boolean;
}

export function FloatingSelectionMenu({
  editor,
  isVisible,
  position,
  onAiImprove,
  onCreateSubIssue,
  isImproving = false,
}: FloatingSelectionMenuProps) {
  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    // cancelled
    if (url === null) {
      return;
    }

    // empty
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // update
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!isVisible || !editor) return null;

  // Render in a portal to avoid clipping by overflow-hidden ancestors
  const menu = (
    <div
      className="fixed z-[99999] bg-[#1c1c1e] border border-[#333] rounded-lg shadow-xl p-1 flex items-center gap-0.5 backdrop-blur-sm pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <TooltipProvider delayDuration={200}>
        {/* Text Formatting */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white pointer-events-auto",
                editor.isActive('bold') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleBold().run();
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Bold className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Bold</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('italic') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleItalic().run();
              }}
            >
              <Italic className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Italic</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('underline') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleUnderline().run();
              }}
            >
              <UnderlineIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Underline</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('strike') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleStrike().run();
              }}
            >
              <Strikethrough className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Strikethrough</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('code') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleCode().run();
              }}
            >
              <Code className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Code</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('codeBlock') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleCodeBlock().run();
              }}
            >
              <FileCode className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Code Block</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('link') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (editor.isActive('link')) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  setLink();
                }
              }}
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Link</TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-6 bg-[#444] mx-1" />

        {/* Headings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('heading', { level: 1 }) ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleHeading({ level: 1 }).run();
              }}
            >
              <Heading1 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Heading 1</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('heading', { level: 2 }) ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleHeading({ level: 2 }).run();
              }}
            >
              <Heading2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Heading 2</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('heading', { level: 3 }) ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleHeading({ level: 3 }).run();
              }}
            >
              <Heading3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Heading 3</TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-6 bg-[#444] mx-1" />

        {/* Lists and Quote */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('bulletList') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleBulletList().run();
              }}
            >
              <List className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Bullet List</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('orderedList') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleOrderedList().run();
              }}
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Numbered List</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 transition-colors hover:bg-[#2a2a2a] hover:text-white",
                editor.isActive('blockquote') ? "bg-[#333] text-white" : "text-[#e6edf3]"
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                editor.chain().focus().toggleBlockquote().run();
              }}
            >
              <Quote className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Quote</TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-6 bg-[#444] mx-1" />

        {/* AI Improve */}
        {onAiImprove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-purple-500/20 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAiImprove?.();
                }}
                disabled={isImproving}
              >
                {isImproving ? (
                  <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                ) : (
                  <WandSparkles className="h-4 w-4 text-purple-400" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">AI Improve Selection</TooltipContent>
          </Tooltip>
        )}

        {/* Create Sub-issue */}
        {onCreateSubIssue && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-blue-500/20 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCreateSubIssue?.();
                }}
              >
                <GitBranch className="h-4 w-4 text-blue-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Create issue from selection</TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  );

  if (typeof window === 'undefined' || !document?.body) return menu;
  return createPortal(menu, document.body);
}
