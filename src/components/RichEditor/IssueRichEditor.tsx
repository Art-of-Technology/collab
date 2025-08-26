"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { RichEditor } from './RichEditor';
import { FloatingSelectionMenu, SlashCommandMenu, AIImprovePopover } from './components';
import { SlashCommandsExtension, SubIssueCreationExtension, SaveDiscardExtension, AIImproveExtension } from './extensions';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
} from 'lucide-react';
import type { SlashCommand } from './extensions/slash-commands-extension';
import type { RichEditorRef } from './types';

interface IssueRichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  
  // Feature flags
  enableSlashCommands?: boolean;
  enableFloatingMenu?: boolean;
  enableSubIssueCreation?: boolean;
  enableSaveDiscard?: boolean;
  
  // Callbacks
  onAiImprove?: (text: string) => Promise<string>;
  onCreateSubIssue?: (selectedText: string) => void;
  onSave?: () => void;
  onDiscard?: () => void;
  onContentChange?: (content: string, hasChanges: boolean) => void;
  
  // Save/Discard specific
  originalContent?: string;
  
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

export function IssueRichEditor({
  value,
  onChange,
  placeholder = "Add description...",
  className,
  minHeight = "200px",
  maxHeight = "500px",
  enableSlashCommands = true,
  enableFloatingMenu = true,
  enableSubIssueCreation = false,
  enableSaveDiscard = false,
  onAiImprove,
  onCreateSubIssue,
  onSave,
  onDiscard,
  onContentChange,
  originalContent,
  onKeyDown,
}: IssueRichEditorProps) {
  const editorRef = useRef<RichEditorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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

  // Handle floating menu for text selection
  const handleSelectionUpdate = useCallback((editor: any) => {
    if (!enableFloatingMenu) return;
    
    const { from, to, empty } = editor.state.selection;
    
    if (!empty && from !== to) {
      const selectedText = editor.state.doc.textBetween(from, to, ' ');
      if (selectedText.trim().length > 0) {
        setTimeout(() => {
          const coords = editor.view.coordsAtPos(from);
          const editorRect = editor.view.dom.getBoundingClientRect();
          
          // Account for any scrollable containers
          const scrollContainer = editor.view.dom.closest('.overflow-y-auto');
          let scrollTop = 0;
          if (scrollContainer) {
            scrollTop = scrollContainer.scrollTop;
          }
          

          
          // Use viewport coordinates for a fixed-position, portaled menu
          setFloatingMenuPosition({
            top: Math.max(8, coords.top - 60 - scrollTop),
            left: Math.max(8, coords.left - 100),
          });
          setShowFloatingMenu(true);
        }, 10);
      }
    } else {
      setShowFloatingMenu(false);
    }
  }, [enableFloatingMenu]);

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
  }, [onAiImprove, isImproving]);

  // Handle applying AI improvement
  const handleApplyImprovement = useCallback(() => {
    console.log('Apply improvement clicked');
    const editor = editorRef.current?.getEditor();
    if (!editor) {
      console.log('No editor found');
      return;
    }

    const extension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'aiImprove');
    console.log('AIImprove extension found:', !!extension);
    console.log('Extension storage:', extension?.storage);
    console.log('Improved text:', improvedText);
    console.log('Improved text type:', typeof improvedText);
    console.log('Improved text length:', improvedText.length);
    
    if (extension && extension.storage.savedSelection && improvedText) {
      const { from, to } = extension.storage.savedSelection;
      console.log('Saved selection:', { from, to });
      
      // Get current selection to compare
      const currentSelection = editor.state.selection;
      console.log('Current selection:', { from: currentSelection.from, to: currentSelection.to });
      
      try {
        // Method 1: Try direct replacement
        let result = editor.chain()
          .focus()
          .setTextSelection({ from, to })
          .insertContent(improvedText)
          .run();
        
        console.log('Method 1 - Direct replacement result:', result);
        
        // If that didn't work, try method 2: delete then insert
        if (!result) {
          console.log('Trying method 2: delete then insert');
          result = editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .deleteSelection()
            .insertContent(improvedText)
            .run();
          
          console.log('Method 2 - Delete then insert result:', result);
        }
        
        // If still not working, try method 3: replace range
        if (!result) {
          console.log('Trying method 3: replace range');
          const replaceResult = editor.commands.insertContentAt({ from, to }, improvedText);
          console.log('Method 3 result:', replaceResult);
        }
        
        // Method 4: Try with plain text if HTML parsing is the issue
        if (!result) {
          console.log('Trying method 4: plain text insertion');
          const textResult = editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .deleteSelection()
            .insertContent({ type: 'text', text: improvedText })
            .run();
          console.log('Method 4 result:', textResult);
        }
        
        // Method 5: Test with simple text to see if insertion works at all
        if (!result) {
          console.log('Trying method 5: simple test insertion');
          const testResult = editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .deleteSelection()
            .insertContent('TEST REPLACEMENT')
            .run();
          console.log('Method 5 test result:', testResult);
        }
        
      } catch (error) {
        console.error('Error replacing text:', error);
      }
    } else {
      console.log('Missing requirements:', {
        hasExtension: !!extension,
        hasSavedSelection: !!(extension?.storage.savedSelection),
        hasImprovedText: !!improvedText
      });
    }

    // Reset state
    setShowImprovePopover(false);
    setImprovedText('');
  }, [improvedText]);

  // Handle canceling AI improvement
  const handleCancelImprovement = useCallback(() => {
    setShowImprovePopover(false);
    setImprovedText('');
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
        if (filteredCommands[selectedSlashIndex]) {
          handleSlashCommandSelect(filteredCommands[selectedSlashIndex]);
        }
        return;
      }
      
      if (e.key === 'Escape') {
        e.preventDefault();
        handleHideSlashMenu();
        return;
      }
    }
    
    // Pass through to parent
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

  // Handle AI improve events
  useEffect(() => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;

    const handleAiImproveReady = (event: CustomEvent) => {
      console.log('AI Improve Ready event received:', event.detail);
      const { improvedText, savedSelection } = event.detail;
      setImprovedText(improvedText);
      setIsImproving(false);
      setShowFloatingMenu(false); // Hide floating menu when showing popover
      
      // Calculate position for the popover
      if (savedSelection) {
        const coords = editor.view.coordsAtPos(savedSelection.from);
        setImprovePosition({
          top: coords.top - 100,
          left: coords.left,
        });
        console.log('Popover position set:', { top: coords.top - 100, left: coords.left });
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
  }, [editorRef.current]);

  // Build extensions array
  const additionalExtensions = [];
  
  if (enableSlashCommands) {
    additionalExtensions.push(
      SlashCommandsExtension.configure({
        commands: DEFAULT_SLASH_COMMANDS,
        onShowMenu: handleShowSlashMenu,
        onHideMenu: handleHideSlashMenu,
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
  
  if (enableSaveDiscard) {
    additionalExtensions.push(
      SaveDiscardExtension.configure({
        onContentChange,
        onSave,
        onDiscard,
        originalContent,
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

  return (
    <div ref={containerRef} className="relative">
      <RichEditor
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
        additionalExtensions={additionalExtensions}
        // Disable internal floating toolbar to avoid duplication; we'll render our own
        toolbarMode="static"
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
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && showImprovePopover && (
        <div className="fixed top-4 right-4 bg-red-500 text-white p-2 text-xs z-[99999]">
          Popover should be visible: {showImprovePopover.toString()}<br/>
          Improved text length: {improvedText.length}<br/>
          Position: {improvePosition.top}, {improvePosition.left}
        </div>
      )}
    </div>
  );
}
