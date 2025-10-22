"use client";

import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  Hash,
  AtSign,
  Link as LinkIcon,
  Image as ImageIcon,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InputDialog } from '@/components/ui/input-dialog';

interface StaticToolbarProps {
  editor: Editor;
  onAiImprove?: () => void;
  isImproving?: boolean;
  onMentionUser?: () => void;
  onMentionIssue?: () => void;
  showAiImprove?: boolean;
  hasContent?: boolean;
}

export function StaticToolbar({
  editor,
  onAiImprove,
  isImproving = false,
  onMentionUser,
  onMentionIssue,
  showAiImprove = false,
  hasContent = false,
}: StaticToolbarProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);

  const insertLink = () => {
    setShowLinkDialog(true);
  };

  const handleLinkConfirm = (url: string) => {
    editor.chain().focus().setLink({ href: url }).run();
  };

  const insertImage = () => {
    setShowImageDialog(true);
  };

  const handleImageConfirm = (url: string) => {
    editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="border-b border-[#333] bg-[#1a1a1a] p-2">
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1 flex-wrap">
          {/* Text Formatting Group */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('bold') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                >
                  <Bold className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Bold</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('italic') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                  <Italic className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Italic</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('underline') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                >
                  <UnderlineIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Underline</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('strike') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                >
                  <Strikethrough className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Strikethrough</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('code') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleCode().run()}
                >
                  <Code className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Code</TooltipContent>
            </Tooltip>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-[#444] mx-1" />

          {/* Headings Group */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('heading', { level: 1 }) ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                >
                  <Heading1 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Heading 1</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('heading', { level: 2 }) ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                  <Heading2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Heading 2</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('heading', { level: 3 }) ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                  <Heading3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Heading 3</TooltipContent>
            </Tooltip>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-[#444] mx-1" />

          {/* Lists and Quote Group */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('bulletList') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Bullet List</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('orderedList') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Numbered List</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('blockquote') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                >
                  <Quote className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Quote</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 hover:bg-[#2a2a2a] transition-colors"
                  onClick={() => editor.chain().focus().setHorizontalRule().run()}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Horizontal Rule</TooltipContent>
            </Tooltip>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-[#444] mx-1" />

          {/* Links and Media Group */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    editor.isActive('link') ? "bg-[#333] text-white" : "hover:bg-[#2a2a2a]"
                  )}
                  onClick={insertLink}
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Link</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 hover:bg-[#2a2a2a] transition-colors"
                  onClick={insertImage}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add Image</TooltipContent>
            </Tooltip>
          </div>

          {/* Separator */}
          <div className="w-px h-6 bg-[#444] mx-1" />

          {/* Mentions Group */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 hover:bg-blue-500/20 transition-colors"
                  onClick={onMentionUser}
                >
                  <AtSign className="h-4 w-4 text-blue-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Mention User</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 hover:bg-green-500/20 transition-colors"
                  onClick={onMentionIssue}
                >
                  <Hash className="h-4 w-4 text-green-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Mention Issue</TooltipContent>
            </Tooltip>
          </div>

          {/* AI Improve */}
          {showAiImprove && onAiImprove && (
            <>
              {/* Separator */}
              <div className="w-px h-6 bg-[#444] mx-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 w-8 transition-colors",
                      hasContent 
                        ? "hover:bg-purple-500/20" 
                        : "opacity-70 cursor-not-allowed"
                    )}
                    onClick={onAiImprove}
                    disabled={isImproving || !hasContent}
                  >
                    {isImproving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                    ) : (
                      <WandSparkles className="h-4 w-4 text-purple-400" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">AI Improve Selection</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </TooltipProvider>

      {/* Link Dialog */}
      <InputDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        title="Insert Link"
        description="Enter the URL for the link"
        placeholder="https://example.com"
        confirmText="Insert Link"
        type="url"
        onConfirm={handleLinkConfirm}
        validate={(value: string) => {
          try {
            new URL(value);
            return undefined;
          } catch {
            return "Please enter a valid URL";
          }
        }}
      />

      {/* Image Dialog */}
      <InputDialog
        open={showImageDialog}
        onOpenChange={setShowImageDialog}
        title="Insert Image"
        description="Enter the URL for the image"
        placeholder="https://example.com/image.jpg"
        confirmText="Insert Image"
        type="url"
        onConfirm={handleImageConfirm}
        validate={(value: string) => {
          try {
            new URL(value);
            return undefined;
          } catch {
            return "Please enter a valid URL";
          }
        }}
      />
    </div>
  );
}
