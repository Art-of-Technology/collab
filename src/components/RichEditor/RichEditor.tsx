"use client";

import React, { forwardRef, useImperativeHandle, useCallback, useRef, useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/context/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
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
  ExternalLink,
} from 'lucide-react';

// Import our custom components
import { StaticToolbar } from './components/StaticToolbar';
import { UserMentionSuggestion } from './components/UserMentionSuggestion';
import { IssueMentionSuggestion } from './components/IssueMentionSuggestion';

// Import our hooks
import { useMentions, useImageUpload, useKeyboardShortcuts } from './hooks';

// Import types
import { RichEditorProps, RichEditorRef } from './types';

// Import utils
import { handlePaste, handleDrop, findMentionTrigger, getCaretPosition, insertMention } from './utils';

// Import mention extensions
import { MentionExtension, IssueMentionExtension } from './extensions';

export const RichEditor = forwardRef<RichEditorRef, RichEditorProps>(({
  value = '',
  onChange,
  placeholder = 'Start typing...',
  className = '',
  minHeight = '100px', // Approximately 4 lines of text
  maxHeight = '400px',
  readOnly = false,
  showToolbar = true,
  toolbarMode = 'floating',
  showAiImprove = false,
  onAiImprove,
  workspaceId
}, ref) => {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  
  // State for floating toolbar and mentions
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [floatingMenuPosition, setFloatingMenuPosition] = useState({ top: 0, left: 0 });
  const [isImproving, setIsImproving] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  const [showImprovePopover, setShowImprovePopover] = useState(false);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null);
  const [mentionSuggestion, setMentionSuggestion] = useState<{ position: { top: number; left: number }; query: string; type: 'user' | 'issue' } | null>(null);
  
  // Initialize editor with extensions
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
      // Mention extensions
      MentionExtension,
      IssueMentionExtension,
    ],
    content: value,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert focus:outline-none max-w-full",
          "text-[#e6edf3] prose-headings:text-white prose-strong:text-white",
          "prose-code:text-[#e6edf3] prose-code:bg-[#1a1a1a] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
          "prose-blockquote:border-l-[#444] prose-blockquote:text-[#9ca3af]",
          "prose-hr:border-[#333]",
          "prose-ul:text-[#e6edf3] prose-ol:text-[#e6edf3] prose-li:text-[#e6edf3]",
          "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300"
        ),
      },
      handleKeyDown: (view, event) => {
        // Handle @ and # for mentions
        if (event.key === '@' || event.key === '#') {
          setTimeout(() => {
            checkForMentionTrigger();
          }, 0);
        }
        
        // Update mention position while typing (check for any printable character or backspace)
        if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
          setTimeout(() => {
            checkForMentionTrigger();
          }, 0);
        }
        
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChange?.(html, text);
      
      // Check for mention triggers
      checkForMentionTrigger();
    },
    onSelectionUpdate: ({ editor }) => {
      // Handle text selection for floating menu (only in floating mode)
      const { from, to, empty } = editor.state.selection;
      
      if (toolbarMode === 'floating' && !empty && from !== to && !readOnly) {
        // Text is selected - show floating menu
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        if (selectedText.trim().length > 0) {
          // Use a timeout to ensure DOM is updated
          setTimeout(() => {
            const coords = editor.view.coordsAtPos(from);
            const editorRect = editorRef.current?.getBoundingClientRect();
            if (editorRect) {
              setFloatingMenuPosition({
                top: coords.top - editorRect.top - 60, // Position above selection
                left: Math.max(0, coords.left - editorRect.left - 100), // Center the menu
              });
              setShowFloatingMenu(true);
            }
          }, 10);
        }
      } else {
        // No selection or static mode - hide floating menu
        setShowFloatingMenu(false);
        if (showImprovePopover && !isImproving) {
          setShowImprovePopover(false);
          setImprovedText(null);
          setSavedSelection(null);
        }
      }
    },
  });

  // Mention trigger check
  const checkForMentionTrigger = useCallback(() => {
    if (!editor || !editorRef.current) return;

    const { from } = editor.state.selection;
    const trigger = findMentionTrigger(editor, from);

    if (trigger) {
      // Use current cursor position (from), not trigger position
      const position = getCaretPosition(editor, from);
      const editorRect = editorRef.current.getBoundingClientRect();
      
      // Improved bounds checking for right-side positioning
      let adjustedLeft = position.left;
      
      // If popup would go off the right edge, position it to the left of cursor instead
      if (position.left + 320 > editorRect.width) {
        // Get cursor position again but for left side
        try {
          const coords = editor.view.coordsAtPos(from); // Use current position
          const leftPosition = coords.left - editorRect.left - 340; // 340px to left of cursor (320px popup + 20px spacing)
          adjustedLeft = Math.max(5, leftPosition);
        } catch {
          adjustedLeft = Math.max(5, position.left - 340);
        }
      }
      
      const adjustedPosition = {
        top: Math.max(5, Math.min(position.top, editorRect.height - 200)), // Prevent vertical overflow
        left: adjustedLeft
      };
      
      setMentionSuggestion({
        position: adjustedPosition,
        query: trigger.query,
        type: trigger.type
      });
    } else {
      setMentionSuggestion(null);
    }
  }, [editor]);

  // Handle mention insertions
  const insertUserMention = useCallback((user: any) => {
    if (!editor || !mentionSuggestion || !user) return;

    const { from } = editor.state.selection;
    const trigger = findMentionTrigger(editor, from);
    
    if (trigger) {
      // Ensure we have a valid label - fallback to email if name is not available
      const label = user.name || user.email || 'Unknown User';
      
      // Use the insertMention utility
      insertMention(
        editor,
        {
          id: user.id || '',
          label: label,
          title: user.name || label
        },
        trigger.position,
        from,
        trigger.char
      );
    }
    
    setMentionSuggestion(null);
  }, [editor, mentionSuggestion]);

  const insertIssueMention = useCallback((issue: any) => {
    if (!editor || !mentionSuggestion || !issue) return;

    const { from } = editor.state.selection;
    const trigger = findMentionTrigger(editor, from);
    
    if (trigger) {
      // Ensure we have valid data with fallbacks
      const label = issue.issueKey || issue.title || 'Unknown Issue';
      const title = issue.title || label;
      const type = issue.type || 'TASK';
      
      insertMention(
        editor,
        {
          id: issue.id || '',
          label: label,
          title: title,
          type: type
        },
        trigger.position,
        from,
        trigger.char
      );
    }
    
    setMentionSuggestion(null);
  }, [editor, mentionSuggestion]);

  // Built-in AI improve functionality (similar to NewIssueModal)
  const builtInAiImprove = useCallback(async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) return text;

    setIsImproving(true);
    
    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error("Failed to improve text");
      }

      const data = await response.json();
      const improvedText = data.message || data.improvedText || text;
      
      return improvedText;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({
        title: "Error",
        description: "Failed to improve text with AI",
        variant: "destructive"
      });
      return text;
    } finally {
      setIsImproving(false);
    }
  }, [isImproving, toast]);

  // AI improvement functionality - only works with selected text
  const handleAiImprove = useCallback(async () => {
    if (!editor || isImproving) return;
    
    // Use provided onAiImprove or fallback to built-in
    const aiImproveFunc = onAiImprove || builtInAiImprove;
    if (!aiImproveFunc) return;
    
    // Only work with selected text
    const { from, to, empty } = editor.state.selection;
    if (empty) return; // No selection, do nothing
    
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;
    
    // Save the selection position
    setSavedSelection({ from, to });
    
    try {
      const result = await aiImproveFunc(selectedText);
      setImprovedText(result);
      setShowImprovePopover(true);
    } catch (error) {
      console.error('Error improving text:', error);
    }
  }, [editor, onAiImprove, builtInAiImprove, isImproving]);

  // Static toolbar handlers
  const handleMentionUser = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent('@').run();
    setTimeout(() => checkForMentionTrigger(), 0);
  }, [editor, checkForMentionTrigger]);

  const handleMentionIssue = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent('#').run();
    setTimeout(() => checkForMentionTrigger(), 0);
  }, [editor, checkForMentionTrigger]);

  // Markdown parsing function (copied from IssueDescriptionEditor)
  const parseMarkdownToTipTap = useCallback((markdown: string) => {
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
    
    // Parse markdown to proper HTML (like IssueDescriptionEditor)
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

  // Sync content when value prop changes
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentContent = editor.getHTML();
      if (value !== currentContent) {
        setTimeout(() => {
          editor.commands.setContent(value || '');
        }, 0);
      }
    }
  }, [editor, value]);

  // Click outside handler and mention click handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
        setShowFloatingMenu(false);
        setMentionSuggestion(null);
      }
    };

    const handleMentionClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const mentionElement = target.closest('[data-type="mention"], [data-type="issue-mention"]') as HTMLElement | null;
      
      if (mentionElement && editorRef.current?.contains(mentionElement)) {
        // prevent editor selection/focus handlers
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
          if (issueKey && currentWorkspace?.slug) {
            const issueUrl = `/${currentWorkspace.slug}/issues/${issueKey}`;
            window.open(issueUrl, '_blank');
          }
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('click', handleMentionClick, true);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('click', handleMentionClick, true);
    };
  }, [currentWorkspace]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    getHTML: () => editor?.getHTML() || '',
    getText: () => editor?.getText() || '',
    setContent: (content: string) => editor?.commands.setContent(content),
    insertText: (text: string) => editor?.commands.insertContent(text),
    clear: () => editor?.commands.clearContent(),
  }), [editor]);

  if (!editor) {
    return null;
  }

  const isEmpty = !value || value === '<p></p>' || value === '';

  return (
    <div className={cn("flex flex-col rounded-md border border-[#333] bg-[#0e0e0e]", className)}>
      {/* Static Toolbar */}
      {showToolbar && toolbarMode === 'static' && !readOnly && (
        <StaticToolbar
          editor={editor}
          onAiImprove={showAiImprove ? handleAiImprove : undefined}
          isImproving={isImproving}
          onMentionUser={handleMentionUser}
          onMentionIssue={handleMentionIssue}
          showAiImprove={showAiImprove}
        />
      )}

      {/* Editor Container */}
      <div 
        className={cn("relative cursor-text flex-1", toolbarMode === 'static' ? "p-3" : "")} 
        ref={editorRef}
        onClick={() => editor?.commands.focus()}
        style={{ minHeight: toolbarMode === 'static' ? 'auto' : minHeight }}
      >
        <EditorContent 
          editor={editor} 
          className={cn(
            "w-full text-[#e6edf3] bg-transparent border-none outline-none resize-none leading-relaxed focus:ring-0 relative z-10",
            "focus-within:outline-none"
          )}
          style={{ 
            minHeight: toolbarMode === 'static' ? '100px' : minHeight,
            padding: toolbarMode === 'static' ? '0' : '0' // Remove any default padding
          }}
        />

        {/* Global CSS for TipTap styling */}
        <style jsx global>{`
          .ProseMirror {
            min-height: ${toolbarMode === 'static' ? '100px' : minHeight};
            outline: none;
            padding: 0;
            line-height: 1.5;
          }
          
          .ProseMirror:focus {
            outline: none;
            box-shadow: none;
          }
          
          .ProseMirror p {
            margin: 0;
            padding: 0;
          }
          
          .ProseMirror p:first-child {
            margin-top: 0;
          }
          
          .ProseMirror p:last-child {
            margin-bottom: 0;
          }
          
          .ProseMirror.is-editor-empty:before {
            color: #6e7681;
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
          
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
        `}</style>
        
        {/* Floating Selection Menu (only in floating mode) */}
        {toolbarMode === 'floating' && showFloatingMenu && (
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

            {/* Mention Triggers */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-blue-500/20 transition-colors"
                  onClick={() => {
                    editor.chain().focus().insertContent('@').run();
                    setTimeout(() => checkForMentionTrigger(), 0);
                  }}
                >
                  <AtSign className="h-4 w-4 text-blue-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Mention User</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-green-500/20 transition-colors"
                  onClick={() => {
                    editor.chain().focus().insertContent('#').run();
                    setTimeout(() => checkForMentionTrigger(), 0);
                  }}
                >
                  <Hash className="h-4 w-4 text-green-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Mention Issue</TooltipContent>
            </Tooltip>

            {/* Separator */}
            <div className="w-px h-6 bg-[#444] mx-1" />

            {/* AI Improve */}
            {showAiImprove && (
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
          </TooltipProvider>
          </div>
        )}

        {/* AI Improve Popover */}
        {showImprovePopover && improvedText && (
        <div 
          className="absolute z-[9999] w-80 bg-[#0e0e0e] border border-[#333] rounded-md shadow-xl overflow-hidden"
          style={{
            top: floatingMenuPosition.top + 45,
            left: Math.max(10, floatingMenuPosition.left + 200),
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

        {/* Mention Suggestions */}
        {mentionSuggestion && (
          <div
            style={{
              position: 'absolute',
              top: `${mentionSuggestion.position.top}px`,
              left: `${mentionSuggestion.position.left}px`,
              zIndex: 999999,
              maxWidth: '320px',
            }}
            className="transition-all duration-200"
          >
            {mentionSuggestion.type === 'user' ? (
              <UserMentionSuggestion
                query={mentionSuggestion.query}
                onSelect={insertUserMention}
                onEscape={() => setMentionSuggestion(null)}
                workspaceId={workspaceId || currentWorkspace?.id}
              />
            ) : (
              <IssueMentionSuggestion
                query={mentionSuggestion.query}
                onSelect={insertIssueMention}
                onEscape={() => setMentionSuggestion(null)}
                workspaceId={workspaceId || currentWorkspace?.id}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

RichEditor.displayName = 'RichEditor';
