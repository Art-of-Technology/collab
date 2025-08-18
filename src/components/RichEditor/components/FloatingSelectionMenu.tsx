import React from 'react';
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
  if (!isVisible || !editor) return null;

  return (
    <div
      className="absolute z-[9998] bg-[#1c1c1e] border border-[#333] rounded-lg shadow-xl p-1 flex items-center gap-0.5 backdrop-blur-sm"
      style={{
        top: position.top,
        left: position.left,
      }}
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
                "h-8 w-8 transition-colors",
                editor.isActive('bold') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleBold().run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('italic') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleItalic().run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('underline') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('strike') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleStrike().run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('code') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <Code className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Code</TooltipContent>
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
                "h-8 w-8 transition-colors",
                editor.isActive('heading', { level: 1 }) ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('heading', { level: 2 }) ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('heading', { level: 3 }) ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('bulletList') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('orderedList') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
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
                "h-8 w-8 transition-colors",
                editor.isActive('blockquote') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
              )}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
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
                onClick={onAiImprove}
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
                onClick={onCreateSubIssue}
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
}
