"use client";

import { useCallback, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Heading from "@tiptap/extension-heading";
import Color from "@tiptap/extension-color";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Code,
  WandSparkles,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface MarkdownEditorProps {
  onChange?: (markdown: string, html: string) => void;
  initialValue?: string;
  content?: string;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  compact?: boolean;
  onAiImprove?: (text: string) => Promise<string>;
}

export function MarkdownEditor({
  onChange,
  content = "",
  initialValue = "",
  placeholder = "Write something...",
  className = "",
  minHeight = "150px",
  maxHeight = "400px",
  compact = false,
  onAiImprove,
}: MarkdownEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  const [showImprovePopover, setShowImprovePopover] = useState(false);

  // Use a stable reference for initialValue to prevent re-renders
  const initialContentRef = useRef(initialValue || content);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-md max-w-full h-auto',
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
      }),
      TextStyle,
      Heading.configure({
        levels: [1, 2, 3],
      }),
      Color,
    ],
    content: initialContentRef.current,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert focus:outline-none max-w-full",
          "min-h-[80px] p-3 rounded-md border-0",
          "overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-border"
        ),
        style: `min-height: ${minHeight}; max-height: ${maxHeight};`,
      }
    },
    onUpdate: ({ editor }) => {
      // Get HTML and markdown content
      const html = editor.getHTML();
      const markdown = editor.storage.markdown?.getMarkdown() || html;
      
      // Call onChange callback with both formats
      onChange?.(markdown, html);
    },
  }, []); // Empty dependency array to ensure editor only initializes once

  const addLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    
    // Update link
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: linkUrl })
      .run();
    
    // Reset and close popup
    setLinkUrl('');
    setShowLinkPopover(false);
  }, [editor, linkUrl]);

  const addImage = useCallback(() => {
    if (!editor || !imageUrl) return;
    
    // Insert image
    editor
      .chain()
      .focus()
      .setImage({ src: imageUrl })
      .run();
    
    // Reset and close popup  
    setImageUrl('');
    setShowImagePopover(false);
  }, [editor, imageUrl]);

  const handleAiImprove = useCallback(async () => {
    if (!editor || !onAiImprove || isImproving) return;
    
    // Get plain text content
    const plainText = editor.getText();
    if (!plainText.trim()) return;
    
    setIsImproving(true);
    
    try {
      // Call the AI improve function and get the improved text
      const result = await onAiImprove(plainText);
      
      // Store the improved text
      setImprovedText(result);
      
      // Show the improved text
      setShowImprovePopover(true);
    } catch (error) {
      console.error('Error improving text:', error);
    } finally {
      setIsImproving(false);
    }
  }, [editor, onAiImprove, isImproving]);

  const applyImprovedText = useCallback(() => {
    if (!editor || !improvedText) return;
    
    // Set the content - replace the existing content
    editor.commands.clearContent();
    editor.commands.insertContent(improvedText);
    
    // Clean up
    setImprovedText(null);
    setShowImprovePopover(false);
  }, [editor, improvedText]);

  const insertImprovedTextBelow = useCallback(() => {
    if (!editor || !improvedText) return;
    
    // Get current content
    const currentContent = editor.getText();
    
    // Set combined content (current + improved)
    editor.commands.setContent(`${currentContent}\n\n${improvedText}`);
    
    // Clean up
    setImprovedText(null);
    setShowImprovePopover(false);
  }, [editor, improvedText]);

  if (!editor) {
    return null;
  }

  // Calculate button size based on compact mode
  const buttonSize = compact ? "size-8" : "size-9";
  const iconSize = compact ? 15 : 18;

  return (
    <div className={cn("flex flex-col rounded-md border", className)}>
      <div className="flex flex-wrap items-center gap-0.5 p-1 border-b bg-muted/30">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleBold().run()}
                data-active={editor.isActive('bold')}
              >
                <Bold size={iconSize} className={editor.isActive('bold') ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Bold</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleItalic().run()}
                data-active={editor.isActive('italic')}
              >
                <Italic size={iconSize} className={editor.isActive('italic') ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Italic</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                data-active={editor.isActive('underline')}
              >
                <UnderlineIcon size={iconSize} className={editor.isActive('underline') ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Underline</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                data-active={editor.isActive('heading', { level: 1 })}
              >
                <Heading1 size={iconSize} className={editor.isActive('heading', { level: 1 }) ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Heading 1</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                data-active={editor.isActive('heading', { level: 2 })}
              >
                <Heading2 size={iconSize} className={editor.isActive('heading', { level: 2 }) ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Heading 2</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                data-active={editor.isActive('heading', { level: 3 })}
              >
                <Heading3 size={iconSize} className={editor.isActive('heading', { level: 3 }) ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Heading 3</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                data-active={editor.isActive('bulletList')}
              >
                <List size={iconSize} className={editor.isActive('bulletList') ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Bullet List</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                data-active={editor.isActive('orderedList')}
              >
                <ListOrdered size={iconSize} className={editor.isActive('orderedList') ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ordered List</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                data-active={editor.isActive('blockquote')}
              >
                <Quote size={iconSize} className={editor.isActive('blockquote') ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Quote</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().toggleCode().run()}
                data-active={editor.isActive('code')}
              >
                <Code size={iconSize} className={editor.isActive('code') ? "text-primary" : ""} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Code</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Popover open={showLinkPopover} onOpenChange={setShowLinkPopover}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(buttonSize, editor.isActive('link') ? "text-primary" : "")}
                    >
                      <LinkIcon size={iconSize} />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Link</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-80 p-3">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Insert Link</div>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://example.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={addLink} disabled={!linkUrl}>Add</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={showImagePopover} onOpenChange={setShowImagePopover}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={buttonSize}
                    >
                      <ImageIcon size={iconSize} />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Image</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-80 p-3">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium">Insert Image URL</div>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={addImage} disabled={!imageUrl}>Add</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
              >
                <Undo size={iconSize} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Undo</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
              >
                <Redo size={iconSize} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Redo</TooltipContent>
          </Tooltip>

          {onAiImprove && (
            <>
              <Separator orientation="vertical" className="mx-1 h-6" />
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={buttonSize}
                    onClick={isImproving ? undefined : handleAiImprove}
                    disabled={isImproving}
                  >
                    {isImproving ? (
                      <Loader2 size={iconSize} className="text-purple-500 animate-spin" />
                    ) : (
                      <WandSparkles size={iconSize} className="text-purple-500" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">AI Improve</TooltipContent>
              </Tooltip>
            </>
          )}
        </TooltipProvider>
      </div>

      <div className="flex-1 relative">
        <EditorContent editor={editor} className="w-full" />
        
        {/* AI Improvement UI (Jira style with site colors) */}
        {showImprovePopover && improvedText && (
          <div className="mt-2 border rounded-md overflow-hidden border-border">
            <div className="border-b bg-primary/10 px-4 py-2">
              <span className="text-sm font-medium text-primary">AI Improved Text</span>
            </div>
            
            <div className="p-4 border-b bg-card">
              <div className="border rounded-md p-3 text-sm bg-muted/30 max-h-[200px] overflow-y-auto">
                {improvedText}
              </div>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-muted/20">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowImprovePopover(false)}
              >
                Cancel
              </Button>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAiImprove}
                  disabled={isImproving}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {isImproving ? "Improving..." : "Regenerate"}
                </Button>
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={insertImprovedTextBelow}
                >
                  Insert below
                </Button>
                
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={applyImprovedText}
                >
                  Replace
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 