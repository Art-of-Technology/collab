"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { RichEditor } from './RichEditor';
import { FloatingSelectionMenu, SlashCommandMenu } from './components';
import { SlashCommandsExtension, SubIssueCreationExtension, SaveDiscardExtension } from './extensions';
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
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            setFloatingMenuPosition({
              top: coords.top - containerRect.top - 60,
              left: Math.max(0, coords.left - containerRect.left - 100),
            });
            setShowFloatingMenu(true);
          }
        }, 10);
      }
    } else {
      setShowFloatingMenu(false);
    }
  }, [enableFloatingMenu]);

  // Handle AI improve
  const handleAiImprove = useCallback(async () => {
    if (!onAiImprove || isImproving) return;
    
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText.trim()) return;
    
    setIsImproving(true);
    try {
      const improvedText = await onAiImprove(selectedText);
      // The AI improve logic will be handled by the existing AIImproveExtension
      editor.commands.improveSelection();
    } catch (error) {
      console.error('Error improving text:', error);
    } finally {
      setIsImproving(false);
    }
  }, [onAiImprove, isImproving]);

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
    </div>
  );
}
