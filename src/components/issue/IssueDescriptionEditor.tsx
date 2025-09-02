"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Heading from "@tiptap/extension-heading";
import Color from "@tiptap/extension-color";
import { Extension } from "@tiptap/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Code,
  Hash,
  Type,
  AlignLeft,
  Minus,
  ChevronRight,
  WandSparkles,
  Loader2,
  RefreshCw,
  Strikethrough,
  MoreHorizontal,
  GitBranch,
} from "lucide-react";

interface IssueDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  onAiImprove?: (text: string) => Promise<string>;
  onCreateSubIssue?: (selectedText: string) => void;
  originalValue?: string;
  onEscWithUnsavedChanges?: () => void;
}

// Slash command menu items
const SLASH_COMMANDS = [
  { 
    id: 'heading1', 
    label: 'Heading 1', 
    icon: Heading1, 
    description: 'Big section heading',
    command: (editor: any) => editor.chain().focus().toggleHeading({ level: 1 }).run()
  },
  { 
    id: 'heading2', 
    label: 'Heading 2', 
    icon: Heading2, 
    description: 'Medium section heading',
    command: (editor: any) => editor.chain().focus().toggleHeading({ level: 2 }).run()
  },
  { 
    id: 'heading3', 
    label: 'Heading 3', 
    icon: Heading3, 
    description: 'Small section heading',
    command: (editor: any) => editor.chain().focus().toggleHeading({ level: 3 }).run()
  },
  { 
    id: 'bulletlist', 
    label: 'Bulleted list', 
    icon: List, 
    description: 'Create a simple bulleted list',
    command: (editor: any) => editor.chain().focus().toggleBulletList().run()
  },
  { 
    id: 'numberedlist', 
    label: 'Numbered list', 
    icon: ListOrdered, 
    description: 'Create a list with numbering',
    command: (editor: any) => editor.chain().focus().toggleOrderedList().run()
  },
  { 
    id: 'quote', 
    label: 'Quote', 
    icon: Quote, 
    description: 'Capture a quote',
    command: (editor: any) => editor.chain().focus().toggleBlockquote().run()
  },
  { 
    id: 'code', 
    label: 'Code block', 
    icon: Code, 
    description: 'Capture a code snippet',
    command: (editor: any) => editor.chain().focus().toggleCodeBlock().run()
  },
  { 
    id: 'divider', 
    label: 'Divider', 
    icon: Minus, 
    description: 'Visually divide blocks',
    command: (editor: any) => editor.chain().focus().setHorizontalRule().run()
  },
];

export function IssueDescriptionEditor({
  value,
  onChange,
  placeholder = "Add description...",
  onKeyDown,
  className,
  onAiImprove,
  onCreateSubIssue,
  originalValue,
  onEscWithUnsavedChanges,
}: IssueDescriptionEditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [floatingMenuPosition, setFloatingMenuPosition] = useState({ top: 0, left: 0 });
  const [isImproving, setIsImproving] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  const [showImprovePopover, setShowImprovePopover] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-400 underline cursor-pointer hover:text-blue-300',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-md max-w-full h-auto',
        },
      }),
      Underline,
      Strike,
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
      }),
      TextStyle,
      Color,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert focus:outline-none max-w-full",
          "text-[#e6edf3] prose-headings:text-white prose-strong:text-white",
          "prose-code:text-[#e6edf3] prose-code:bg-[#1a1a1a] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
          "prose-blockquote:border-l-[#444] prose-blockquote:text-[#9ca3af]",
          "prose-hr:border-[#333]",
          "prose-ul:text-[#e6edf3] prose-ol:text-[#e6edf3] prose-li:text-[#e6edf3]",
          "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300",
          // Placeholder styles
          "[&.ProseMirror.is-editor-empty]:before:content-[attr(data-placeholder)] [&.ProseMirror.is-editor-empty]:before:text-[#6e7681] [&.ProseMirror.is-editor-empty]:before:pointer-events-none [&.ProseMirror.is-editor-empty]:before:float-left [&.ProseMirror.is-editor-empty]:before:h-0"
        ),
      },
      handleKeyDown: (view, event) => {
        // Handle slash commands
        if (event.key === '/') {
          const { from } = view.state.selection;
          const beforeText = view.state.doc.textBetween(Math.max(0, from - 10), from, ' ', ' ');
          
          if (beforeText.trim() === '' || beforeText.endsWith(' ')) {
            setTimeout(() => {
              const coords = view.coordsAtPos(from);
              const editorRect = editorRef.current?.getBoundingClientRect();
              if (editorRect) {
                setSlashMenuPosition({
                  top: coords.bottom - editorRect.top + 5,
                  left: coords.left - editorRect.left,
                });
                setShowSlashMenu(true);
                setSlashQuery('');
                setSelectedSlashIndex(0);
              }
            }, 0);
          }
        }

        // Handle escape key
        if (event.key === 'Escape') {
          // First priority: close slash menu if open
          if (showSlashMenu) {
            setShowSlashMenu(false);
            return true;
          }
          
          // Second priority: handle unsaved changes if callback is provided
          if (onEscWithUnsavedChanges && originalValue !== undefined) {
            const hasUnsavedChanges = value !== originalValue && 
              !(value === '<p></p>' && originalValue === '') &&
              !(value === '' && originalValue === '<p></p>');
            
            if (hasUnsavedChanges) {
              onEscWithUnsavedChanges();
              return true;
            }
          }
          
          // If no slash menu and no unsaved changes, let the event bubble up
          return false;
        }

        // Handle arrow keys in slash menu
        if (showSlashMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          const filteredCommands = SLASH_COMMANDS.filter(cmd => 
            cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
          );
          
          if (event.key === 'ArrowDown') {
            setSelectedSlashIndex(prev => 
              prev < filteredCommands.length - 1 ? prev + 1 : 0
            );
          } else {
            setSelectedSlashIndex(prev => 
              prev > 0 ? prev - 1 : filteredCommands.length - 1
            );
          }
          return true;
        }

        // Handle enter in slash menu
        if (showSlashMenu && event.key === 'Enter') {
          event.preventDefault();
          const filteredCommands = SLASH_COMMANDS.filter(cmd => 
            cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
          );
          
          if (filteredCommands[selectedSlashIndex]) {
            executeSlashCommand(filteredCommands[selectedSlashIndex]);
          }
          return true;
        }

        // Handle custom onKeyDown
        if (onKeyDown) {
          const syntheticEvent = event as any;
          onKeyDown(syntheticEvent);
        }

        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const content = editor.getHTML();
      onChange(content);

      // Handle slash command query updates
      if (showSlashMenu) {
        const { from } = editor.state.selection;
        const beforeText = editor.state.doc.textBetween(Math.max(0, from - 50), from, ' ', ' ');
        const slashIndex = beforeText.lastIndexOf('/');
        
        // Check if there's a slash at the expected position and no spaces after it
        if (slashIndex !== -1) {
          const textAfterSlash = beforeText.substring(slashIndex + 1);
          // Only keep menu open if there are no spaces after the slash (which would break the command)
          if (!textAfterSlash.includes(' ')) {
            setSlashQuery(textAfterSlash);
            setSelectedSlashIndex(0);
          } else {
            setShowSlashMenu(false);
          }
        } else {
          setShowSlashMenu(false);
        }
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // Handle text selection for floating menu
      const { from, to, empty } = editor.state.selection;
      
      if (!empty && from !== to) {
        // Text is selected - show floating menu
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        if (selectedText.trim().length > 0) {
          // Use a timeout to ensure DOM is updated
          setTimeout(() => {
            const coords = editor.view.coordsAtPos(from);
            const editorRect = editorRef.current?.getBoundingClientRect();
            if (editorRect) {
              setFloatingMenuPosition({
                top: coords.top - editorRect.top - 60, // Position above selection with more space
                left: Math.max(0, coords.left - editorRect.left - 100), // Center the menu and prevent overflow
              });
              setShowFloatingMenu(true);
            }
          }, 10);
        }
      } else {
        // No selection - hide floating menu
        setShowFloatingMenu(false);
        // Only hide AI improve popover when selection is lost if we're not improving
        if (showImprovePopover && !isImproving) {
          setShowImprovePopover(false);
          setImprovedText(null);
          setSavedSelection(null);
        }
      }
    },
    onFocus: () => {
      setIsFocused(true);
    },
    onBlur: () => {
      setIsFocused(false);
    },
  }, []);

  // Sync content when value prop changes
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentContent = editor.getHTML();
      if (value !== currentContent) {
        // Use a small delay to ensure editor is fully initialized
        setTimeout(() => {
          editor.commands.setContent(value || '');
        }, 0);
      }
    }
  }, [editor, value]);

  const executeSlashCommand = useCallback((command: typeof SLASH_COMMANDS[0]) => {
    if (!editor) return;

    // Remove the slash and query text
    const { from } = editor.state.selection;
    const beforeText = editor.state.doc.textBetween(Math.max(0, from - 20), from, ' ', ' ');
    const slashIndex = beforeText.lastIndexOf('/');
    
    if (slashIndex !== -1) {
      const deleteFrom = from - (beforeText.length - slashIndex);
      editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
    }

    // Execute the command
    command.command(editor);
    setShowSlashMenu(false);
  }, [editor]);

  const filteredCommands = SLASH_COMMANDS.filter(cmd => 
    cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
  );

  // AI Improve functionality - only works with selected text
  const handleAiImprove = useCallback(async () => {
    if (!editor || !onAiImprove || isImproving) return;
    
    // Only work with selected text
    const { from, to, empty } = editor.state.selection;
    if (empty) return; // No selection, do nothing
    
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;
    
    // Save the selection position
    setSavedSelection({ from, to });
    
    setIsImproving(true);
    // Keep floating menu open during improvement
    
    try {
      const result = await onAiImprove(selectedText);
      setImprovedText(result);
      setShowImprovePopover(true);
    } catch (error) {
      console.error('Error improving text:', error);
    } finally {
      setIsImproving(false);
    }
  }, [editor, onAiImprove, isImproving]);

  const parseMarkdownToTipTap = useCallback((markdown: string) => {
    // Create a temporary editor to parse markdown
    const tempDiv = document.createElement('div');
    
    // Simple markdown to HTML conversion
    let html = markdown
      // Bold: **text** or __text__
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_ (but avoid conflicts with bold)
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
      // Headers
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      // Code blocks
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Horizontal rules
      .replace(/^---+$/gm, '<hr>')
      .replace(/^\*\*\*+$/gm, '<hr>')
      // Blockquotes
      .replace(/^>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>')
      // Lists - numbered
      .replace(/^\d+\.\s+(.+)$/gm, '::OL::<li>$1</li>')
      // Lists - bulleted
      .replace(/^[\-\*\+]\s+(.+)$/gm, '::UL::<li>$1</li>')
      // Line breaks
      .replace(/\n/g, '<br>');
    
    // Process lists properly
    html = html
      // Group consecutive ordered list items
      .replace(/(::OL::<li>.*?<\/li>(<br>)?)+/g, (match) => {
        const items = match.replace(/::OL::/g, '').replace(/<br>/g, '');
        return `<ol>${items}</ol>`;
      })
      // Group consecutive unordered list items
      .replace(/(::UL::<li>.*?<\/li>(<br>)?)+/g, (match) => {
        const items = match.replace(/::UL::/g, '').replace(/<br>/g, '');
        return `<ul>${items}</ul>`;
      })
      // Clean up remaining markers
      .replace(/::OL::/g, '')
      .replace(/::UL::/g, '');
    
    // Clean up extra line breaks
    html = html
      .replace(/<br>\s*<\/h[123]>/g, '</h$1>')
      .replace(/<br>\s*<\/blockquote>/g, '</blockquote>')
      .replace(/<br>\s*<\/li>/g, '</li>')
      .replace(/<br>\s*<hr>/g, '<hr>')
      .replace(/(<\/(?:ol|ul|blockquote|h[123]|hr)>)\s*<br>/g, '$1');
    
    return html;
  }, []);

  const applyImprovedText = useCallback(() => {
    if (!editor || !improvedText || !savedSelection) return;
    
    // Replace only the originally selected text
    const { from, to } = savedSelection;
    
    // Parse markdown to proper HTML
    const htmlContent = parseMarkdownToTipTap(improvedText);
    
    editor.chain()
      .focus()
      .setTextSelection({ from, to })
      .deleteSelection()
      .insertContent(htmlContent)
      .run();
    
    setImprovedText(null);
    setShowImprovePopover(false);
    setSavedSelection(null);
  }, [editor, improvedText, savedSelection, parseMarkdownToTipTap]);

  const handleCreateSubIssue = useCallback(() => {
    if (!editor || !onCreateSubIssue) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    
    if (selectedText.trim()) {
      onCreateSubIssue(selectedText.trim());
      setShowFloatingMenu(false);
    }
  }, [editor, onCreateSubIssue]);



  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
        setShowSlashMenu(false);
        setShowFloatingMenu(false);
        // Don't close AI improve popover on outside click - let user interact with it
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!editor) {
    return null;
  }

  const isEmpty = !value || value === '<p></p>' || value === '';

  return (
    <div 
      className={cn("relative cursor-text", className)} 
      ref={editorRef}
      onClick={() => editor?.commands.focus()}
    >
      {/* Custom placeholder overlay when editor is empty */}
      {isEmpty && (
        <div 
          className="absolute top-0 left-0 pointer-events-none text-[#6e7681] select-none z-0"
        >
          {placeholder}
        </div>
      )}
      
      <EditorContent 
        editor={editor} 
        className={cn(
          "w-full min-h-[80px] text-[#e6edf3] bg-transparent border-none outline-none resize-none leading-relaxed focus:ring-0 relative z-10",
          "focus-within:outline-none"
        )}
      />

      {/* Global CSS for TipTap styling */}
      <style jsx global>{`
        .ProseMirror {
          min-height: 80px;
          outline: none;
        }
        
        .ProseMirror:focus {
          outline: none;
          box-shadow: none;
        }
        
        .ProseMirror p {
          margin: 0;
        }
        
        .ProseMirror p:first-child {
          margin-top: 0;
        }
        
        .ProseMirror p:last-child {
          margin-bottom: 0;
        }
      `}</style>
      
      {/* Floating Selection Menu */}
      {showFloatingMenu && (
        <div
          className="absolute z-[9998] bg-[#1c1c1e] border border-[#333] rounded-lg shadow-xl p-1 flex items-center gap-0.5 backdrop-blur-sm"
          style={{
            top: floatingMenuPosition.top,
            left: floatingMenuPosition.left,
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
                    onClick={handleAiImprove}
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
                    onClick={handleCreateSubIssue}
                  >
                    <GitBranch className="h-4 w-4 text-blue-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Create issue from selection</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      )}

      {/* AI Improve Popover - positioned relative to AI improve button */}
      {showImprovePopover && improvedText && (
        <div 
          className="absolute z-[9999] w-80 bg-[#0e0e0e] border border-[#333] rounded-md shadow-xl overflow-hidden"
          style={{
            top: floatingMenuPosition.top + 45, // Position below the floating menu
            left: Math.max(10, floatingMenuPosition.left + 200), // Align with AI improve button (rightmost button)
          }}
        >
          <div className="p-3 border-b border-[#333] bg-[#1a1a1a]">
            <h4 className="text-sm font-semibold text-[#e6edf3]">AI Improved Text</h4>
            <p className="text-xs text-[#9ca3af] mt-1">Review and apply the AI improved version</p>
          </div>
          <div className="p-3 max-h-48 overflow-y-auto text-sm bg-[#0e0e0e] text-[#e6edf3]">
            <div className="whitespace-pre-wrap">
              {improvedText}
            </div>
          </div>
          <div className="border-t border-[#333] p-2 flex justify-end gap-2 bg-[#1a1a1a]">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => {
                setShowImprovePopover(false);
                setImprovedText(null);
                setSavedSelection(null);
              }}
              className="text-[#9ca3af] hover:text-white"
            >
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={applyImprovedText}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Apply
            </Button>
          </div>
        </div>
      )}
      
      {/* Slash Command Menu */}
      {showSlashMenu && (
        <div
          className="absolute z-[9997] w-72 bg-[#1c1c1e] border border-[#333] rounded-md shadow-lg overflow-hidden"
          style={{
            top: slashMenuPosition.top,
            left: slashMenuPosition.left,
          }}
        >
          <div className="text-xs text-[#9ca3af] px-3 py-2 border-b border-[#333] bg-[#0e0e0e]">
            Blocks
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {filteredCommands.length > 0 ? (
              filteredCommands.map((command, index) => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      index === selectedSlashIndex 
                        ? "bg-[#2a2a2a]" 
                        : "hover:bg-[#1a1a1a]"
                    )}
                    onClick={() => executeSlashCommand(command)}
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-md bg-[#333] flex items-center justify-center">
                      <Icon className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#e6edf3]">
                        {command.label}
                      </div>
                      <div className="text-xs text-[#6e7681] truncate">
                        {command.description}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-[#6e7681] text-sm">
                No matching blocks
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
}

