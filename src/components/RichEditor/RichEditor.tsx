"use client";

import React, { forwardRef, useImperativeHandle, useCallback, useRef, useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
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
  WandSparkles,
  Loader2,
  Hash,
  AtSign,
} from 'lucide-react';

// Import our custom components
import { StaticToolbar, UserMentionSuggestion, IssueMentionSuggestion, AIImprovePopover } from './components';

// Import our hooks
import { useImageUpload } from './hooks';

// Import types
import { RichEditorProps, RichEditorRef } from './types';

// Import utils
import { findMentionTrigger, getCaretPosition, insertMention, builtInAiImprove } from './utils';

// Import extensions
import { MentionExtension, IssueMentionExtension, AIImproveExtension, ResizableImageExtension, ImageCSSExtension } from './extensions';

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
  workspaceId,
  onSelectionUpdate,
  onKeyDown,
  onUpdate,
  additionalExtensions = [],
  autofocus = false,
}, ref) => {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  // Guard to prevent onUpdate → onChange → setContent recursion
  const isExternalUpdateRef = useRef(false);
  // Guard to suppress transient checks during mention insertion
  const isInsertingMentionRef = useRef(false);
  
  // Helper to release guards on the next tick after ProseMirror updates
  const releaseMentionGuardsNextTick = () => {
    setTimeout(() => {
      isInsertingMentionRef.current = false;
      isExternalUpdateRef.current = false;
    }, 0);
  };
  
  // Generate unique ID for this editor instance to avoid CSS conflicts
  const editorId = useRef(`rich-editor-${Math.random().toString(36).substr(2, 9)}`).current;
  
  // State for floating toolbar and mentions
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [floatingMenuPosition, setFloatingMenuPosition] = useState({ top: 0, left: 0 });
  const [mentionSuggestion, setMentionSuggestion] = useState<{ position: { top: number; left: number }; query: string; type: 'user' | 'issue' } | null>(null);
  
  // AI Improve state
  const [isImproving, setIsImproving] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  const [showImprovePopover, setShowImprovePopover] = useState(false);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number; originalText: string } | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [isEmpty, setIsEmpty] = useState(!value || value === '' || value === '<p></p>' || value === '<p><br></p>');
  
  // Initialize editor with extensions
  const editor = useEditor({
    autofocus: autofocus,
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
      ResizableImageExtension.configure({
        HTMLAttributes: {
          class: 'resizable-image',
        },
      }),
      ImageCSSExtension,
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
      // AI Improve extension (only for floating mode)
      ...(toolbarMode === 'floating' ? [AIImproveExtension.configure({
        onAiImprove: onAiImprove || builtInAiImprove,
        showAiImprove,
      })] : []),
      // Additional extensions passed from props
      ...additionalExtensions,
    ],
    content: value || '',
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
        // First, call the parent's onKeyDown handler if provided
        if (onKeyDown) {
          let eventHandled = false;
          
          // Create React-compatible event object
          const reactEvent = {
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            preventDefault: () => {
              event.preventDefault();
              eventHandled = true;
            },
            stopPropagation: () => {
              event.stopPropagation();
              eventHandled = true;
            },
            defaultPrevented: event.defaultPrevented,
            // Add minimal required React event properties
            nativeEvent: event,
            currentTarget: event.target,
            target: event.target,
            bubbles: event.bubbles,
            cancelable: event.cancelable,
            type: event.type,
            timeStamp: event.timeStamp,
            isDefaultPrevented: () => event.defaultPrevented || eventHandled,
            isPropagationStopped: () => eventHandled,
            persist: () => {},
          } as unknown as React.KeyboardEvent;

          onKeyDown(reactEvent);
          
          // If the event was handled, return true to stop processing
          if (eventHandled || event.defaultPrevented) {
            return true;
          }
        }
        
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
      handlePaste: (view, event, slice) => {
        // Handle image paste
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.indexOf('image') === 0) {
              const file = item.getAsFile();
              if (file) {
                event.preventDefault();
                uploadAndInsertImage(file);
                return true;
              }
            }
          }
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        // Handle image drop
        const files = event.dataTransfer?.files;
        if (files) {
          for (const file of Array.from(files)) {
            if (file.type.indexOf('image') === 0) {
              event.preventDefault();
              uploadAndInsertImage(file);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      // Always compute current content
      const html = editor.getHTML();
      const text = editor.getText();

      // Avoid feedback loops when we programmatically set content or insert mentions
      if (!isExternalUpdateRef.current) {
        onChange?.(html, text);
      }

      // Check if editor has mentions when determining empty state
      const hasMentions = html.includes('data-type="mention"') || html.includes('data-type="issue-mention"');
      const isTextEmpty = !text.trim() || html === '<p></p>' || html === '<p><br></p>';
      const shouldShowPlaceholder = isTextEmpty && !hasMentions;
      
      // Update isEmpty state
      setIsEmpty(shouldShowPlaceholder);
      
      // Update hasContent for AI Improve button
      const hasTextContent = text.trim().length > 0;
      setHasContent(hasTextContent);
      
      // Manually manage placeholder visibility by adding/removing a CSS class
      const editorElement = editor.view.dom;
      if (shouldShowPlaceholder) {
        editorElement.classList.add('should-show-placeholder');
      } else {
        editorElement.classList.remove('should-show-placeholder');
      }

      // Check for mention triggers
      if (!isInsertingMentionRef.current) {
        checkForMentionTrigger();
      }

      // Call external update callback
      onUpdate?.(editor);
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
      
      // Call external selection update callback
      onSelectionUpdate?.(editor);
    },
  });

  // Image upload hook
  const { isUploading: isUploadingImage, uploadAndInsertImage } = useImageUpload(editor);



  // Mention trigger check with safeguards against infinite loops
  const checkForMentionTrigger = useCallback(() => {
    // Early return with safety checks
    if (!editor || !editorRef.current) {
      return;
    }

    // Check if we're currently inserting a mention to avoid recursive calls
    if (isInsertingMentionRef.current) {
      return;
    }

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
      isInsertingMentionRef.current = true;
      isExternalUpdateRef.current = true;
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
      // Release guards on next tick after ProseMirror updates
      releaseMentionGuardsNextTick();
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
      
      isInsertingMentionRef.current = true;
      isExternalUpdateRef.current = true;
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
      // Release guards on next tick after ProseMirror updates
      releaseMentionGuardsNextTick();
    }
    
    setMentionSuggestion(null);
  }, [editor, mentionSuggestion]);

  // AI improvement functionality
  const handleAiImprove = useCallback(() => {
    if (!editor || isImproving) return;
    
    if (toolbarMode === 'static') {
      // Static mode: handle AI improve directly
      const { from, to, empty } = editor.state.selection;
      
      if (empty) {
        return; // No selection
      }
      
      const selectedText = editor.state.doc.textBetween(from, to, ' ');
      if (!selectedText.trim()) {
        return;
      }
      
      // Set popup position
      const editorRect = editorRef.current?.getBoundingClientRect();
      if (editorRect) {
        setFloatingMenuPosition({
          top: 45,
          left: (editorRect.width - 500) / 2,
        });
      }
      
      // Save selection for later use
      setSavedSelection({ from, to, originalText: selectedText });
      
      setIsImproving(true);
      
      // Call AI improve directly
      builtInAiImprove(selectedText)
        .then((improvedText) => {
          flushSync(() => {
            setImprovedText(improvedText);
            setShowImprovePopover(true);
            setIsImproving(false);
          });
        })
        .catch((error) => {
          console.error('Error improving text:', error);
          setIsImproving(false);
        });
      
      return;
    }
    
    // Floating mode: use extension
    setIsImproving(true);
    const result = editor.commands.improveSelection();
    
    if (!result) {
      setIsImproving(false);
    }
  }, [editor, isImproving, toolbarMode]);

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

  const applyImprovedText = useCallback(() => {
    if (!editor || !improvedText) {
      return;
    }


    // For floating mode, need savedSelection
    if (!savedSelection) {
      return;
    }

    const { from, to, originalText } = savedSelection;
    try {
      // Get current document state
      const currentDoc = editor.state.doc;
      const currentDocLength = currentDoc.content.size;

      // Try direct replacement first
      if (from >= 0 && to <= currentDocLength && from <= to) {
        const currentTextAtPosition = currentDoc.textBetween(from, to, ' ');

        // Try the replacement regardless of whether text matches exactly
        // This handles cases where formatting might affect comparison
        const result = editor.chain()
          .focus()
          .setTextSelection({ from, to })
          .deleteSelection()
          .insertContent(improvedText)
          .run();

        if (result) {
          setImprovedText(null);
          setShowImprovePopover(false);
          setSavedSelection(null);
          return;
        }
      }

      // Fallback 1: Search for the original text in the document
      const fullText = editor.getText();
      const originalTextIndex = fullText.indexOf(originalText);

      if (originalTextIndex !== -1) {
        // Calculate character positions in the document
        // This is a simplified approach - for complex docs we'd need more sophisticated position mapping
        let charCount = 0;
        let foundFrom = -1;
        let foundTo = -1;

        // Walk through the document to find the correct positions
        currentDoc.descendants((node, pos) => {
          if (node.isText) {
            const nodeText = node.text || '';
            const nodeStart = charCount;
            const nodeEnd = charCount + nodeText.length;

            if (originalTextIndex >= nodeStart && originalTextIndex < nodeEnd) {
              foundFrom = pos + (originalTextIndex - nodeStart);
              foundTo = foundFrom + originalText.length;
              return false; // Stop traversing
            }

            charCount += nodeText.length;
          } else if (node.isBlock) {
            charCount += 1; // Add space for block breaks
          }
          return true;
        });

        if (foundFrom !== -1 && foundTo !== -1) {
          const result = editor.chain()
            .focus()
            .setTextSelection({ from: foundFrom, to: foundTo })
            .deleteSelection()
            .insertContent(improvedText)
            .run();

          if (result) {
            setImprovedText(null);
            setShowImprovePopover(false);
            setSavedSelection(null);
            return;
          }
        }
      }

      // Fallback 2: Replace current selection if any
      const { from: currentFrom, to: currentTo } = editor.state.selection;

      if (currentFrom !== currentTo) {
        editor.chain()
          .focus()
          .deleteSelection()
          .insertContent(improvedText)
          .run();
      } else {
        editor.chain()
          .focus()
          .insertContent(improvedText)
          .run();
      }

    } catch (error) {
      // Final fallback: just insert the text
      try {
        editor.chain()
          .focus()
          .insertContent(improvedText)
          .run();
      } catch (finalError) {
        // Silent fallback - don't log errors
      }
    }
    
    // Clean up state
    setImprovedText(null);
    setShowImprovePopover(false);
    setSavedSelection(null);
  }, [editor, improvedText, savedSelection, toolbarMode]);

  const cancelImproveText = useCallback(() => {
    setShowImprovePopover(false);
    setImprovedText(null);
    setSavedSelection(null);
    setIsImproving(false);
  }, []);

  // Sync content when value prop changes
  useEffect(() => {
    if (editor && value !== undefined) {
      const currentContent = editor.getHTML();
      if (value !== currentContent) {
        // Prevent update feedback loop when syncing external value
        isExternalUpdateRef.current = true;
        editor.commands.setContent(value || '');
        // Release guard after ProseMirror processes this transaction
        setTimeout(() => {
          isExternalUpdateRef.current = false;
        }, 0);
      }
    }
  }, [editor, value]);

  // Handle issue mention clicks with workspace resolution
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

  // Click outside handler and mention click handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
        // Check if click is on AI Improve popup
        const target = event.target as HTMLElement;
        const isClickOnPopover = target.closest('[data-ai-improve-popover]');
        
        if (!isClickOnPopover) {
        setShowFloatingMenu(false);
        setMentionSuggestion(null);
        setShowImprovePopover(false);
        }
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
          if (issueKey) {
            // Resolve the issue to its correct workspace
            handleIssueMentionClick(issueKey);
          }
        }
      }
    };

    // AI Improve event handlers
    const handleAiImproveReady = (event: CustomEvent) => {
      const { improvedText, savedSelection } = event.detail;
      
      // Only handle this event in floating mode
      if (toolbarMode === 'floating') {
        setImprovedText(improvedText);
        setSavedSelection(savedSelection);
        setShowImprovePopover(true);
        setIsImproving(false);
      }
    };

    const handleAiImproveError = (event: CustomEvent) => {
      setIsImproving(false);
      toast({
        title: "Error",
        description: "Failed to improve text with AI",
        variant: "destructive"
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('click', handleMentionClick, true);
    
    const currentEditorRef = editorRef.current;
    if (currentEditorRef) {
      currentEditorRef.addEventListener('ai-improve-ready', handleAiImproveReady as EventListener);
      currentEditorRef.addEventListener('ai-improve-error', handleAiImproveError as EventListener);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('click', handleMentionClick, true);
      
      if (currentEditorRef) {
        currentEditorRef.removeEventListener('ai-improve-ready', handleAiImproveReady as EventListener);
        currentEditorRef.removeEventListener('ai-improve-error', handleAiImproveError as EventListener);
      }
    };
  }, [currentWorkspace, toast, handleIssueMentionClick]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    getHTML: () => editor?.getHTML() || '',
    getText: () => editor?.getText() || '',
    setContent: (content: string) => {
      isExternalUpdateRef.current = true;
      editor?.commands.setContent(content);
      setTimeout(() => {
        isExternalUpdateRef.current = false;
      }, 0);
    },
    insertText: (text: string) => editor?.commands.insertContent(text),
    clear: () => editor?.commands.clearContent(),
    getEditor: () => editor,
  }), [editor]);

  // Update isEmpty when value prop changes
  useEffect(() => {
    const isContentEmpty = !value || value === '' || value === '<p></p>' || value === '<p><br></p>';
    setIsEmpty(isContentEmpty);
  }, [value]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn(
      "relative flex flex-col",
      showToolbar && toolbarMode === 'static' ? "rounded-md border border-[#333] bg-[#0e0e0e]" : "",
      className
    )}>
      {/* Static Toolbar */}
      {showToolbar && toolbarMode === 'static' && !readOnly && (
        <StaticToolbar
          editor={editor}
          onAiImprove={showAiImprove ? handleAiImprove : undefined}
          isImproving={isImproving}
          onMentionUser={handleMentionUser}
          onMentionIssue={handleMentionIssue}
          showAiImprove={showAiImprove}
          hasContent={hasContent}
        />
      )}

      {/* Editor Container */}
      <div 
        className={cn(
          "relative cursor-text flex-1", 
          toolbarMode === 'static' ? "p-0" : "",
          maxHeight && maxHeight !== 'none' ? "overflow-y-auto" : "",
          editorId // Add unique class for scoped CSS
        )} 
        ref={editorRef}
        onClick={() => editor?.commands.focus()}
        style={{ 
          minHeight: toolbarMode === 'static' ? 'auto' : minHeight,
          maxHeight: maxHeight && maxHeight !== 'none' ? maxHeight : undefined
        }}
      >
        {/* Custom Placeholder Overlay */}
        {isEmpty && !readOnly && (
          <div 
            className="absolute pointer-events-none text-[#6e7681] text-sm z-0"
            style={{ 
              // In static mode, offset by the container's p-2 padding (8px)
              top: toolbarMode === 'static' ? '8px' : '0',
              left: toolbarMode === 'static' ? '8px' : '0',
              lineHeight: '1.5',
              fontSize: '14px'
            }}
          >
            {placeholder}
          </div>
        )}
        
        <EditorContent 
          editor={editor} 
          className={cn(
            "w-full text-[#e6edf3] bg-transparent border-none outline-none resize-none leading-relaxed focus:ring-0 relative z-10",
            "focus-within:outline-none"
          )}
          style={{ 
            minHeight: toolbarMode === 'static' ? '100px' : (maxHeight && maxHeight !== 'none' ? 'auto' : minHeight),
            padding: toolbarMode === 'static' ? '8px' : '0' // Remove any default padding
          }}
        />

        {/* Scoped CSS for this TipTap editor instance */}
        <style jsx global>{`
          .${editorId} .ProseMirror {
            min-height: ${toolbarMode === 'static' ? '100px' : (maxHeight && maxHeight !== 'none' ? 'auto' : minHeight)};
            outline: none;
            padding: 0;
            line-height: 1.5;
          }
          
          .${editorId} .ProseMirror:focus {
            outline: none;
            box-shadow: none;
          }
          
          .${editorId} .ProseMirror p {
            margin: 0;
            padding: 0;
          }
          
          .${editorId} .ProseMirror p:first-child {
            margin-top: 0;
          }
          
          .${editorId} .ProseMirror p:last-child {
            margin-bottom: 0;
          }
          
          /* Placeholder for truly empty editor */
          .${editorId} .ProseMirror.is-editor-empty.should-show-placeholder:before {
            color: #6e7681 !important;
            content: attr(data-placeholder) !important;
            pointer-events: none;
            position: relative;
            display: block;
            font-size: 14px;
            line-height: 1.5;
            z-index: 1;
          }
          
          /* Placeholder for editor with just empty paragraph - only show when should-show-placeholder class is present */
          .${editorId} .ProseMirror.should-show-placeholder p:first-child:last-child:empty:before {
            color: #6e7681 !important;
            content: attr(data-placeholder) !important;
            pointer-events: none;
            position: relative;
            display: inline-block;
            font-size: 14px;
            line-height: 1.5;
            z-index: 1;
          }
          
          /* Hide placeholder when paragraph contains mentions (fallback for browsers without JS control) */
          .${editorId} .ProseMirror p:first-child:last-child:has(.mention):before,
          .${editorId} .ProseMirror p:first-child:last-child:has(.issue-mention):before,
          .${editorId} .ProseMirror p:first-child:last-child:has([data-type="mention"]):before,
          .${editorId} .ProseMirror p:first-child:last-child:has([data-type="issue-mention"]):before {
            display: none !important;
          }
          
          /* Static toolbar mode specific styles */
          ${toolbarMode === 'static' ? `
            .${editorId} .ProseMirror.is-editor-empty:before,
            .${editorId} .ProseMirror p:first-child:last-child:empty:before {
              display: none !important;
            }
          ` : ''}
          
          /* Override any prose styles for placeholder */
          .prose .${editorId} .ProseMirror.is-editor-empty:before,
          .prose .${editorId} .ProseMirror p:first-child:last-child:empty:before {
            color: #6e7681 !important;
            margin: 0 !important;
            padding: 0 !important;
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


        {/* Upload overlay */}
        {isUploadingImage && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-[9999]">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background border shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Uploading image...</span>
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

       {/* AI Improve Popover */}
       <AIImprovePopover
         isVisible={showImprovePopover}
         improvedText={improvedText || ''}
         position={floatingMenuPosition}
         onApply={applyImprovedText}
         onCancel={cancelImproveText}
         isImproving={isImproving}
       />
    </div>
  );
 });

RichEditor.displayName = 'RichEditor';
