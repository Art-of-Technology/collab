"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { RichEditor } from './RichEditor';
import { FloatingSelectionMenu, SlashCommandMenu, AIImprovePopover } from './components';
import { SlashCommandsExtension, SubIssueCreationExtension, AIImproveExtension } from './extensions';
import { parseMarkdownToTipTap } from './utils/ai-improve';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  X,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import type { SlashCommand } from './extensions/slash-commands-extension';
import type { RichEditorRef } from './types';
import { handleSlashCommandUpdate } from '@/utils/slash-command-utils';
import { HocuspocusManager } from '@/lib/collaboration/provider';
import type { HocuspocusConfig } from '@/lib/collaboration/types';
import { createCollaborationUser } from '@/lib/collaboration/utils';
import { useSession } from 'next-auth/react';
import { useCurrentUser } from '@/hooks/queries/useUser';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import DOMPurify from 'isomorphic-dompurify';
import { cn } from '@/lib/utils';
import { useIssueActivities } from '@/components/issue/sections/activity/hooks/useIssueActivities';
import { CustomAvatar } from '@/components/ui/custom-avatar';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { IS_COLLABORATIVE_EDITING_ENABLED } from '@/lib/featureFlags';

interface IssueRichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  collabDocumentId?: string;
  issueId?: string;

  // Feature flags
  enableSlashCommands?: boolean;
  enableFloatingMenu?: boolean;
  enableSubIssueCreation?: boolean;

  // Callbacks
  onAiImprove?: (text: string) => Promise<string>;
  onCreateSubIssue?: (selectedText: string) => void;

  // Keyboard shortcuts
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

// Default slash commands
const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
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

export const IssueRichEditor = React.forwardRef<RichEditorRef, IssueRichEditorProps>(({
  value,
  onChange,
  placeholder = "Add description...",
  className,
  minHeight = "200px",
  maxHeight = "500px",
  enableSlashCommands = true,
  enableFloatingMenu = true,
  enableSubIssueCreation = false,
  onAiImprove,
  onCreateSubIssue,
  onKeyDown,
  collabDocumentId,
  issueId,
}, ref) => {
  const editorRef = useRef<RichEditorRef>(null);

  // Expose the editor ref to parent component
  React.useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    getHTML: () => editorRef.current?.getHTML() || '',
    getText: () => editorRef.current?.getText() || '',
    setContent: (content: string) => editorRef.current?.setContent(content),
    insertText: (text: string) => editorRef.current?.insertText(text),
    clear: () => editorRef.current?.clear(),
    getEditor: () => editorRef.current?.getEditor(),
  }), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const hocuspocusManagerRef = useRef<HocuspocusManager | null>(null);
  const [collabReady, setCollabReady] = useState(0);
  const { toast } = useToast();
  const { data: session } = useSession();
  const { data: currentUser } = useCurrentUser();
  const collaborationUser = useMemo(() => createCollaborationUser(session, currentUser), [session, currentUser]);
  const isCollaborationEnabled = IS_COLLABORATIVE_EDITING_ENABLED;
  const hasCollabDocumentId = !!collabDocumentId;
  // Slash commands state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  // Floating menu state
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [floatingMenuPosition, setFloatingMenuPosition] = useState({ top: 0, left: 0 });

  // AI improve state
  const [isImproving, setIsImproving] = useState(false);
  const [showImprovePopover, setShowImprovePopover] = useState(false);
  const [improvedText, setImprovedText] = useState<string>('');
  const [improvePosition, setImprovePosition] = useState({ top: 0, left: 0 });
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number; originalText: string } | null>(null);

  // History modal state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [historyPreview, setHistoryPreview] = useState<{ id: string; html: string; meta: any } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const htmlFromSnapshot = useCallback((snapshot: any) => {
    try {
      if (typeof snapshot === 'string') {
        const trimmed = snapshot.trim();
        if (trimmed.startsWith('<')) return trimmed;
        try {
          const asJson = JSON.parse(trimmed);
          // If consumers still pass JSON doc, render fallback to simple text
          return `<div>${DOMPurify.sanitize(JSON.stringify(asJson))}</div>`;
        } catch {
          return `<p>${DOMPurify.sanitize(trimmed)}</p>`;
        }
      }
      if (snapshot && typeof snapshot === 'object') {
        // If object, try to use displayNewValue/newValue if present
        const html = snapshot.displayNewValue || snapshot.newValue || snapshot.description;
        if (typeof html === 'string') return html;
      }
      return '<p>(unable to render)</p>';
    } catch {
      return '<p>(unable to render)</p>';
    }
  }, []);

  const openHistoryPreview = useCallback(async (entry: any) => {
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const content = entry?.content ?? entry?.details?.displayNewValue ?? entry?.details?.newValue;
      const html = DOMPurify.sanitize(htmlFromSnapshot(content));
      setHistoryPreview({ id: String(entry.id), html, meta: entry });
    } catch (e: any) {
      setPreviewError(e?.message || 'Failed to load history entry');
    } finally {
      setPreviewLoading(false);
    }
  }, [htmlFromSnapshot]);

  // Activities (DESCRIPTION_UPDATED) via hook
  const { activities, loading: activitiesLoading, error: activitiesError } = useIssueActivities({
    issueId: issueId || '',
    limit: 100,
    action: 'DESCRIPTION_UPDATED' as any,
  });

  // Auto-select last activity when opening or when list updates
  useEffect(() => {
    if (!isHistoryOpen) return;
    if (!selectedEntryId && activities && activities.length > 0) {
      setSelectedEntryId(activities[0].id);
    }
  }, [isHistoryOpen, activities, selectedEntryId]);

  // Get filtered commands based on query
  const filteredCommands = DEFAULT_SLASH_COMMANDS.filter(cmd =>
    cmd.label.toLowerCase().includes(slashQuery.toLowerCase())
  );

  // Handle slash command menu
  const handleShowSlashMenu = useCallback((position: { top: number; left: number }, query: string) => {
    setSlashMenuPosition(position);
    setSlashQuery(query);
    setSelectedSlashIndex(0);
    setShowSlashMenu(true);
  }, []);

  const handleHideSlashMenu = useCallback(() => {
    setShowSlashMenu(false);
    setSlashQuery("");
    setSelectedSlashIndex(0);
  }, []);

  const handleSlashCommandSelect = useCallback((command: SlashCommand) => {
    const editor = editorRef.current?.getEditor();
    if (editor) {
      editor.commands.executeSlashCommand(command);
    }
  }, []);

  const calculateElementPosition = useCallback((
    editor: any,
    from: number,
    elementHeight: number,
    elementWidth: number,
    positionAbove: boolean = true
  ) => {
    const coords = editor.view.coordsAtPos(from);
    const selectionWidth = coords.right - coords.left;
    const viewportPadding = 8;
    const elementGap = 8;
    
    const finalWidth = Math.min(elementWidth, window.innerWidth - (viewportPadding * 2));
    
    let top = positionAbove 
      ? coords.top - elementHeight - elementGap
      : coords.bottom + elementGap;
    let left = coords.left + (selectionWidth / 2) - (finalWidth / 2);
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left < viewportPadding) {
      left = viewportPadding;
    } else if (left + finalWidth > viewportWidth - viewportPadding) {
      left = viewportWidth - finalWidth - viewportPadding;
    }
    
    if (positionAbove) {
      if (top < viewportPadding) {
        top = coords.bottom + elementGap;
      }
      if (top + elementHeight > viewportHeight - viewportPadding) {
        top = viewportHeight - elementHeight - viewportPadding;
      }
    } else {
      if (top + elementHeight > viewportHeight - viewportPadding) {
        top = coords.top - elementHeight - elementGap;
      }
      if (top < viewportPadding) {
        top = viewportPadding;
      }
    }

    return { top, left };
  }, []);

  const updateFloatingMenuPosition = useCallback((editor: any, from: number) => {
    if (!enableFloatingMenu || !editor) return;

    const position = calculateElementPosition(editor, from, 40, 400, true);
    setFloatingMenuPosition(position);
  }, [enableFloatingMenu, calculateElementPosition]);

  // Handle floating menu for text selection
  const handleSelectionUpdate = useCallback((editor: any) => {
    if (!enableFloatingMenu) return;

    const { from, to, empty } = editor.state.selection;

    if (!empty && from !== to) {
      const selectedText = editor.state.doc.textBetween(from, to, ' ');
      if (selectedText.trim().length > 0) {
        setTimeout(() => {
          updateFloatingMenuPosition(editor, from);
          setShowFloatingMenu(true);
        }, 10);
      }
    } else {
      setShowFloatingMenu(false);
    }
  }, [enableFloatingMenu, updateFloatingMenuPosition]);

  // Handle AI improve
  const handleAiImprove = useCallback(() => {
    if (!onAiImprove || isImproving) return;

    const editor = editorRef.current?.getEditor();
    if (!editor) return;

    const { from, to, empty } = editor.state.selection;
    if (empty) return;

    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;

    console.log('AI Improve clicked, selected text:', selectedText);
    setIsImproving(true);

    // Use the AIImproveExtension command
    const result = editor.commands.improveSelection();
    console.log('AIImproveExtension command result:', result);

    // If the command returned false, reset the loading state
    if (!result) {
      setIsImproving(false);
    }
  }, [onAiImprove, isImproving]);

  // Handle applying AI improvement
  const handleApplyImprovement = useCallback(() => {
    console.log('Apply improvement clicked');
    const editor = editorRef.current?.getEditor();
    if (!editor) {
      console.log('No editor found');
      return;
    }

    console.log('Apply improvement - current state:', {
      improvedText,
      savedSelection,
      hasImprovedText: !!improvedText,
      hasSavedSelection: !!savedSelection
    });

    if (savedSelection && improvedText) {
      const { from, to, originalText } = savedSelection;
      console.log('Saved selection:', { from, to, originalText });

      // Get current selection to compare
      const currentSelection = editor.state.selection;
      console.log('Current selection:', { from: currentSelection.from, to: currentSelection.to });

      try {
        // Check what type of content we're replacing
        const originalTextContent = editor.state.doc.textBetween(from, to, ' ');
        const isSimpleText = originalTextContent === originalText && !originalTextContent.includes('\n');

        console.log('Content replacement context:', {
          originalText,
          originalTextContent,
          isSimpleText,
          improvedText,
          selectionRange: { from, to }
        });

        // Parse the improved text as markdown to HTML for better formatting
        const htmlContent = parseMarkdownToTipTap(improvedText);
        console.log('Parsed improved content:', { original: improvedText, parsed: htmlContent });

        // For simple text replacements, try to use plain text first to avoid extra formatting
        const contentToInsert = isSimpleText && !htmlContent.includes('<') ? improvedText : htmlContent;
        console.log('Content to insert:', contentToInsert);

        // Method 1: Try direct replacement
        let result = editor.chain()
          .focus()
          .setTextSelection({ from, to })
          .insertContent(contentToInsert)
          .run();

        console.log('Method 1 - Direct replacement result:', result);

        // If that didn't work, try method 2: delete then insert
        if (!result) {
          console.log('Trying method 2: delete then insert');
          result = editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .deleteSelection()
            .insertContent(contentToInsert)
            .run();

          console.log('Method 2 - Delete then insert result:', result);
        }

        // If still not working, try method 3: replace range
        if (!result) {
          console.log('Trying method 3: replace range');
          const replaceResult = editor.commands.insertContentAt({ from, to }, contentToInsert);
          console.log('Method 3 result:', replaceResult);
        }

        // Method 4: Try with plain text only if we were using HTML
        if (!result && contentToInsert !== improvedText) {
          console.log('Trying method 4: fallback to plain text');
          const textResult = editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .deleteSelection()
            .insertContent(improvedText)
            .run();
          console.log('Method 4 result:', textResult);
        }

        // Method 5: Final fallback - structured text insertion
        if (!result) {
          console.log('Trying method 5: structured text replacement');
          const testResult = editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .deleteSelection()
            .insertContent({ type: 'text', text: improvedText })
            .run();
          console.log('Method 5 result:', testResult);
        }

      } catch (error) {
        console.error('Error replacing text:', error);
      }
    } else {
      console.log('Missing requirements:', {
        hasSavedSelection: !!savedSelection,
        hasImprovedText: !!improvedText
      });
    }

    // Reset state
    setShowImprovePopover(false);
    setImprovedText('');
    setSavedSelection(null);
  }, [improvedText, savedSelection]);

  // Handle canceling AI improvement
  const handleCancelImprovement = useCallback(() => {
    setShowImprovePopover(false);
    setImprovedText('');
    setSavedSelection(null);
  }, []);

  // Handle sub-issue creation
  const handleCreateSubIssue = useCallback(() => {
    if (!onCreateSubIssue) return;

    const editor = editorRef.current?.getEditor();
    if (editor) {
      editor.commands.createSubIssueFromSelection();
      setShowFloatingMenu(false);
    }
  }, [onCreateSubIssue]);

  // Handle keyboard events for slash menu
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation(); // Prevent event from bubbling up

        if (e.key === 'ArrowDown') {
          setSelectedSlashIndex(prev =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
        } else {
          setSelectedSlashIndex(prev =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation(); // Prevent event from bubbling up
        if (filteredCommands[selectedSlashIndex]) {
          handleSlashCommandSelect(filteredCommands[selectedSlashIndex]);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // Prevent event from bubbling up
        handleHideSlashMenu();
        return;
      }
    }

    // Pass through to parent only if slash menu is not handling the event
    onKeyDown?.(e);
  }, [showSlashMenu, filteredCommands, selectedSlashIndex, handleSlashCommandSelect, handleHideSlashMenu, onKeyDown]);

  // Handle clicks outside to close menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSlashMenu(false);
        setShowFloatingMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle scroll events to update floating menu and AI improve popup positions
  useEffect(() => {
    if ((!showFloatingMenu && !showImprovePopover) || !enableFloatingMenu) return;

    const handleScroll = () => {
      const editor = editorRef.current?.getEditor();
      if (!editor) return;

      const { from, to, empty } = editor.state.selection;
      if (!empty && from !== to) {
        if (showFloatingMenu) {
          updateFloatingMenuPosition(editor, from);
        }
        
        if (showImprovePopover && savedSelection) {
          const position = calculateElementPosition(editor, savedSelection.from, 192, 288, false);
          setImprovePosition(position);
        }
      }
    };

    // Add scroll listeners to window and any scrollable containers
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Also listen for scroll events on scrollable containers within the editor
    const editorElement = editorRef.current?.getEditor()?.view.dom;
    if (editorElement) {
      const scrollContainers = editorElement.closest('.overflow-y-auto') || 
                               editorElement.closest('.overflow-auto') ||
                               editorElement.closest('[data-scroll-container]');
      
      if (scrollContainers) {
        scrollContainers.addEventListener('scroll', handleScroll, { passive: true });
      }
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      const editorElement = editorRef.current?.getEditor()?.view.dom;
      if (editorElement) {
        const scrollContainers = editorElement.closest('.overflow-y-auto') || 
                                 editorElement.closest('.overflow-auto') ||
                                 editorElement.closest('[data-scroll-container]');
        
        if (scrollContainers) {
          scrollContainers.removeEventListener('scroll', handleScroll);
        }
      }
    };
  }, [showFloatingMenu, showImprovePopover, enableFloatingMenu, updateFloatingMenuPosition, savedSelection]);

  // Handle AI improve events - set up listeners when editor is ready
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 50; // Maximum 5 seconds (50 * 100ms)

    const setupEventListeners = (): (() => void) => {
      const editor = editorRef.current?.getEditor();
      if (!editor) {
        // If editor is not ready, try again with retry limit
        if (retryCount < maxRetries) {
          retryCount++;
          timeoutId = setTimeout(setupEventListeners, 100);
        }
        // Always return a cleanup function
        return () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        };
      }

      const handleAiImproveReady = (event: CustomEvent) => {
        const { improvedText, savedSelection: eventSavedSelection } = event.detail;
        setImprovedText(improvedText);
        setSavedSelection(eventSavedSelection);
        setIsImproving(false);
        setShowFloatingMenu(false); // Hide floating menu when showing popover

        if (eventSavedSelection) {
          const position = calculateElementPosition(editor, eventSavedSelection.from, 192, 288, false);
          setImprovePosition(position);
        }

        setShowImprovePopover(true);
        console.log('Show improve popover set to true');
      };

      const handleAiImproveError = (event: CustomEvent) => {
        console.error('AI improve error:', event.detail.error);
        setIsImproving(false);
        setShowImprovePopover(false);
      };

      editor.view.dom.addEventListener('ai-improve-ready', handleAiImproveReady as EventListener);
      editor.view.dom.addEventListener('ai-improve-error', handleAiImproveError as EventListener);

      return () => {
        editor.view.dom.removeEventListener('ai-improve-ready', handleAiImproveReady as EventListener);
        editor.view.dom.removeEventListener('ai-improve-error', handleAiImproveError as EventListener);
      };
    };

    const cleanup = setupEventListeners();
    return cleanup;
  }, [collabReady]);

  // Initialize collaboration (Hocuspocus) when document id is provided
  useEffect(() => {
    if (!isCollaborationEnabled || !hasCollabDocumentId) return;

    const initializeCollaboration = async () => {
      if (hocuspocusManagerRef.current) return;

      const config: HocuspocusConfig = { documentId: collabDocumentId };
      const manager = new HocuspocusManager(config);
      hocuspocusManagerRef.current = manager;
      try {
        await manager.initialize();
        setCollabReady((v) => v + 1);
      } catch (e) {
        console.error('Failed to initialize collaboration:', e);
      }
    };

    initializeCollaboration();
    return () => {
      hocuspocusManagerRef.current?.destroy();
      hocuspocusManagerRef.current = null;
    };
  }, [isCollaborationEnabled, hasCollabDocumentId, collabDocumentId]);

  // Build extensions array
  const additionalExtensions = [];

  if (enableSlashCommands) {
    additionalExtensions.push(
      SlashCommandsExtension.configure({
        commands: DEFAULT_SLASH_COMMANDS,
        onShowMenu: handleShowSlashMenu,
        onHideMenu: handleHideSlashMenu,
        isMenuOpen: () => showSlashMenu,
      })
    );
  }

  if (enableSubIssueCreation) {
    additionalExtensions.push(
      SubIssueCreationExtension.configure({
        onCreateSubIssue,
      })
    );
  }

  // Always add AI improve extension if onAiImprove is provided
  if (onAiImprove) {
    additionalExtensions.push(
      AIImproveExtension.configure({
        onAiImprove,
        showAiImprove: true,
      })
    );
  }

  // Add collaboration extensions when ready
  if (isCollaborationEnabled && hocuspocusManagerRef.current) {
    try {
      const collabExts = hocuspocusManagerRef.current.getCollaborationExtensions(collaborationUser);
      additionalExtensions.push(...collabExts);
    } catch (err) {
      // noop: manager may not be ready yet
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <RichEditor
        autofocus={true}
        key={isCollaborationEnabled ? `collab-${collabDocumentId}-${collabReady}` : 'nocollab'}
        ref={editorRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
        minHeight={minHeight}
        maxHeight={maxHeight}
        onAiImprove={onAiImprove}
        onSelectionUpdate={handleSelectionUpdate}
        onKeyDown={handleKeyDown}
        onUpdate={(editor) => {
          // Handle slash command query updates
          if (showSlashMenu) {
            handleSlashCommandUpdate(editor, {
              setSlashQuery,
              setSelectedSlashIndex,
              hideSlashMenu: handleHideSlashMenu,
            });
          }
        }}
        additionalExtensions={additionalExtensions}
        // Disable internal floating toolbar to avoid duplication; we'll render our own
        toolbarMode="custom"
        showToolbar={false}
      />

      {/* Floating Selection Menu */}
      {enableFloatingMenu && (
        <FloatingSelectionMenu
          editor={editorRef.current?.getEditor()}
          isVisible={showFloatingMenu}
          position={floatingMenuPosition}
          onAiImprove={onAiImprove ? handleAiImprove : undefined}
          onCreateSubIssue={enableSubIssueCreation ? handleCreateSubIssue : undefined}
          isImproving={isImproving}
        />
      )}

      {/* Slash Command Menu */}
      {enableSlashCommands && (
        <SlashCommandMenu
          isVisible={showSlashMenu}
          position={slashMenuPosition}
          commands={filteredCommands}
          selectedIndex={selectedSlashIndex}
          onCommandSelect={handleSlashCommandSelect}
        />
      )}

      {/* AI Improve Popover */}
      {onAiImprove && (
        <AIImprovePopover
          isVisible={showImprovePopover}
          improvedText={improvedText}
          position={improvePosition}
          onApply={handleApplyImprovement}
          onCancel={handleCancelImprovement}
          isImproving={isImproving}
        />
      )}

      {/* History Modal */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>History</DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-white/10"
                onClick={() => setIsHistoryOpen(false)}
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          {activitiesError && (
            <div className="text-sm text-red-400 mb-2">{activitiesError}</div>
          )}
          {/* List view vs Preview view */}
          {historyPreview ? (
            <div className="flex flex-col gap-3">
              {/* Preview header */}
              <div className="flex items-center justify-start gap-4">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="hover:bg-white/10" onClick={() => { setHistoryPreview(null); setPreviewError(null); }}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                </div>
                <div className="flex gap-2.5 items-center">
                  <div className="flex-shrink-0 mt-0.5">
                    <CustomAvatar user={historyPreview.meta?.user} size="xs" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col">
                      <span className="text-xs text-[#c9d1d9] leading-tight tracking-tight">
                        {historyPreview.meta?.actor} made changes
                      </span>
                      <span className="text-[10px] text-[#7d8590] leading-tight tracking-tight">
                        {formatDistanceToNow(new Date(historyPreview.meta?.ts || Date.now()), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {previewError && (
                <div className="text-sm text-red-400">{previewError}</div>
              )}

              <div className="border rounded-md overflow-hidden">
                <ScrollArea className="h-72">
                  <div className="p-3">
                    {previewLoading ? (
                      <div className="p-3 text-sm text-muted-foreground">Loading preview...</div>
                    ) : (
                      <RichEditor
                        value={historyPreview.html}
                        onChange={undefined}
                        placeholder={""}
                        className="w-96"
                        minHeight="160px"
                        maxHeight="none"
                        readOnly={true}
                        showToolbar={false}
                        toolbarMode="custom"
                      />
                    )}
                  </div>
                </ScrollArea>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="hover:bg-white/10"
                  onClick={() => {
                    try {
                      const html = historyPreview?.html || '';
                      const editor = editorRef.current;
                      if (editor && typeof editor.setContent === 'function') {
                        editor.setContent(html);
                      } else {
                        editorRef.current?.getEditor()?.commands.setContent(html);
                      }
                      const username = historyPreview?.meta?.actor || historyPreview?.meta?.user?.name || 'unknown';
                      const dateStr = new Date(historyPreview?.meta?.ts || Date.now()).toLocaleString();
                      setIsHistoryOpen(false);
                      setHistoryPreview(null);
                      setPreviewError(null);
                      toast({
                        title: 'Reverted',
                        description: `Successfully returned into ${username}'s version ${dateStr}`,
                      });
                    } catch (e) {
                      toast({ title: 'Error', description: 'Failed to revert', variant: 'destructive' });
                    }
                  }}
                >
                  Revert to this version
                </Button>
              </div>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <ScrollArea className="h-[378px]">
                <div className="divide-y divide-border/50">
                  {activitiesLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Loading...</div>
                  ) : activities.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No history entries</div>
                  ) : (
                    activities.map((a) => (
                      <button
                        key={a.id}
                        className={cn(
                          "w-full text-left p-3 hover:bg-[#0d0d0d]",
                          selectedEntryId === a.id ? "bg-muted/60" : ""
                        )}
                        onClick={() => {
                          setSelectedEntryId(a.id);
                          openHistoryPreview({
                            id: a.id,
                            content: a.details?.displayNewValue || a.details?.newValue || a.newValue,
                            user: a.user,
                            actor: a.user?.name,
                            ts: new Date(a.createdAt).getTime(),
                          });
                        }}
                      >
                        <div className="flex gap-2.5 items-center">
                          <div className="flex-shrink-0 mt-0.5">
                            <CustomAvatar user={a.user} size="xs" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-xs text-[#c9d1d9]">
                                {a.user.name} made changes
                              </span>
                              <span className="text-[10px] text-[#7d8590]">
                                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
});

IssueRichEditor.displayName = 'IssueRichEditor';
