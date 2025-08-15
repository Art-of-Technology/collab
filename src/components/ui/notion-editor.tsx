"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Heading from "@tiptap/extension-heading";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Extension } from "@tiptap/core";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { cn } from "@/lib/utils";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Table as TableIcon,
  Type,
  Minus,
  Palette,
  Plus,
} from "lucide-react";
import { uploadImage } from "@/utils/cloudinary";
import { InlineColorPalette } from "@/components/ui/color-palette";
import { RgbaColor, RgbaTextStyle } from "@/components/ui/rgba-color-extension";

interface NotionEditorProps {
  onChange?: (html: string) => void;
  initialValue?: string;
  content?: string;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
}

// Floating toolbar extension
const FloatingToolbar = Extension.create({
  name: 'floatingToolbar',

  addOptions() {
    return {
      element: null,
    }
  },

  onCreate() {
    this.options.element = document.createElement('div')
    this.options.element.className = 'floating-toolbar'
    document.body.appendChild(this.options.element)
  },

  onDestroy() {
    if (this.options.element) {
      document.body.removeChild(this.options.element)
    }
  }
})

// Custom Image extension with resize functionality (simplified version)
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {};
          }
          return { width: attributes.width };
        },
      },
      height: {
        default: null,
        renderHTML: (attributes) => {
          if (!attributes.height) {
            return {};
          }
          return { height: attributes.height };
        },
      },
    };
  },
});

export function NotionEditor({
  onChange,
  content = "",
  initialValue = "",
  placeholder = "",
  className = "",
  minHeight = "150px",
  maxHeight = "400px",
}: NotionEditorProps) {

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [colorPalettePosition, setColorPalettePosition] = useState({ top: 0, left: 0 });

  // Keyboard navigation for slash commands
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const slashStartPosRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        link: false,
        underline: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      ResizableImage.configure({
        HTMLAttributes: {
          class: 'resizable-image',
        },
      }),
      Underline,
      // ENHANCED PLACEHOLDER - Shows on every empty node
      Placeholder.configure({
        placeholder: ({ node, pos, editor }) => {

          // Show placeholder only for empty paragraphs
          if (node.type.name === 'paragraph') {
            // Check if this paragraph is inside a list item or blockquote
            const $pos = editor.state.doc.resolve(pos);
            const isInsideListItem = $pos.parent?.type.name === 'listItem';
            const isInsideBlockquote = $pos.parent?.type.name === 'blockquote';

            // If inside a list item, show list item placeholder
            if (isInsideListItem) {
              return 'List item';
            }

            // If inside a blockquote, show quote placeholder
            if (isInsideBlockquote) {
              return 'Quote';
            }

            return placeholder || "Write, press '/' for commands...";
          }

          // Show specific placeholders for headings
          if (node.type.name === 'heading') {
            console.log('heading', node.attrs.level);
            const level = node.attrs.level;
            return `Heading ${level}`;
          }

          // Don't show placeholder for list items (handled by paragraph inside)
          if (node.type.name === 'listItem') {
            return '';
          }

          // Don't show placeholder for blockquotes (handled by paragraph inside)
          if (node.type.name === 'blockquote') {
            return '';
          }

          return '';
        },
        emptyEditorClass: 'is-editor-empty',
        emptyNodeClass: 'is-empty',
        showOnlyWhenEditable: true,
        showOnlyCurrent: true, // Show only on the current focused node
        includeChildren: true, // Include child nodes
      }),
      RgbaTextStyle,
      Heading.configure({
        levels: [1, 2, 3],
        HTMLAttributes: {
          class: 'notion-heading',
        },
      }),
      RgbaColor,
      Table.configure({
        resizable: false,
        HTMLAttributes: {
          class: 'border-collapse border border-border w-full',
          style: 'table-layout: fixed; width: 100%;',
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'border-b border-border',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-border p-2',
          style: 'word-wrap: break-word; overflow-wrap: break-word; max-width: 200px; min-width: 100px;',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-border p-2 font-semibold bg-muted',
          style: 'word-wrap: break-word; overflow-wrap: break-word; max-width: 200px; min-width: 100px;',
        },
      }),
      FloatingToolbar,
      // DragHandle extension kaldırıldı - component olarak kullanacağız
    ],
    content: initialValue || content || '<p></p>',
    editable: true,
    autofocus: true,
    // New v3 options for better performance
    shouldRerenderOnTransaction: false,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert focus:outline-none max-w-full",
          "min-h-[80px] p-4 rounded-md border-0",
          "overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-border",
          "notion-editor"
        ),
        style: `min-height: ${minHeight}; max-height: ${maxHeight};`,
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html);
    },
  }, [placeholder, minHeight, maxHeight, onChange]);

  // Handle plus button clicks
  const handlePlusClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (!editor) return;

    // Get the button element and its position
    const buttonElement = event.currentTarget as HTMLElement;
    const buttonRect = buttonElement.getBoundingClientRect();

    // Find which line/block this button belongs to by its vertical position
    // Get the position at the button's vertical center
    const viewPos = editor.view.posAtCoords({
      left: buttonRect.right + 50, // A bit to the right of the button
      top: buttonRect.top + (buttonRect.height / 2) // Vertical center of button
    });

    if (!viewPos) return;

    // Get the resolved position
    const $pos = editor.state.doc.resolve(viewPos.pos);

    // Find the start of the current line/block
    const lineStart = $pos.start($pos.depth);

    // Move cursor to the end of current line's content
    const lineEnd = $pos.end($pos.depth);

    // Set cursor to the end of the line
    editor.chain()
      .focus()
      .setTextSelection(lineEnd)
      .run();

    // Store the position for slash command
    slashStartPosRef.current = lineEnd;

    // Get coordinates at the cursor position
    const domPosition = editor.view.coordsAtPos(lineEnd);
    const editorContainer = editor.view.dom.getBoundingClientRect();

    // Set slash menu position
    setSlashPosition({
      top: domPosition.bottom - editorContainer.top,
      left: domPosition.left - editorContainer.left,
    });

    setShowSlashCommands(true);
    setSlashQuery('');
    setSelectedCommandIndex(-1);
    setIsKeyboardNavigation(false);
  }, [editor]);

  // Handle content updates
  useEffect(() => {
    if (editor && content !== undefined && content !== editor.getHTML()) {
      const contentToSet = content || '<p></p>';
      editor.commands.setContent(contentToSet, { emitUpdate: false });
    }
  }, [editor, content]);

  // Auto-focus editor when it's ready
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // Small delay to ensure the editor is fully rendered
      const timer = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.focus();
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [editor]);
  
  // Close color palette when clicking outside
  useEffect(() => {
    if (!showColorPalette) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      // Close the color palette when clicking outside
      if (event.target && !(event.target as Element).closest('.color-palette-container')) {
        setShowColorPalette(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColorPalette]);

  // Handle slash commands
  useEffect(() => {
    if (!editor) return;

    // Wait for the editor view to be available
    if (!editor.view) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Additional safety check
      if (!editor || !editor.view) return;

      if (event.key === '/') {
        // Only show slash commands at the start of a line or after whitespace
        const { from } = editor.state.selection;
        const $from = editor.state.doc.resolve(from);
        const beforeChar = $from.nodeBefore?.textContent?.slice(-1) || '';
        const isAtLineStart = from === $from.start($from.depth);

        if (isAtLineStart || beforeChar === ' ' || beforeChar === '\n') {
          // Prevent the slash from being inserted into the editor
          event.preventDefault();
          // Remember caret position where slash menu was invoked
          slashStartPosRef.current = from;

          const domPosition = editor.view.coordsAtPos(from);
          const editorDom = editor.view.dom;
          if (!editorDom) return;

          const editorContainer = editorDom.getBoundingClientRect();

          setSlashPosition({
            top: domPosition.bottom - editorContainer.top,
            left: domPosition.left - editorContainer.left,
          });
          setShowSlashCommands(true);
          setSlashQuery('');
          setSelectedCommandIndex(-1);
          setIsKeyboardNavigation(false);
        }
      } else if (showSlashCommands) {
        if (event.key === 'Escape') {
          setShowSlashCommands(false);
          setSelectedCommandIndex(-1);
          setIsKeyboardNavigation(false);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setIsKeyboardNavigation(true);
          const filteredCommands = slashCommands.filter(cmd =>
            cmd.title.toLowerCase().includes(slashQuery.toLowerCase())
          );
          setSelectedCommandIndex(prev =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setIsKeyboardNavigation(true);
          const filteredCommands = slashCommands.filter(cmd =>
            cmd.title.toLowerCase().includes(slashQuery.toLowerCase())
          );
          setSelectedCommandIndex(prev =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
        } else if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          const filteredCommands = slashCommands.filter(cmd =>
            cmd.title.toLowerCase().includes(slashQuery.toLowerCase())
          );
          if (selectedCommandIndex >= 0 && filteredCommands[selectedCommandIndex]) {
            executeSlashCommand(filteredCommands[selectedCommandIndex].command);
          } else {
            setShowSlashCommands(false);
          }
          setSelectedCommandIndex(-1);
          setIsKeyboardNavigation(false);

          return false; // Prevent any further processing
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          // Only allow alphanumeric characters for query
          if (/[a-zA-Z0-9]/.test(event.key)) {
            event.preventDefault();
            setSlashQuery(prev => prev + event.key);
            setSelectedCommandIndex(-1);
            setIsKeyboardNavigation(false);
          }
        } else if (event.key === 'Backspace') {
          if (slashQuery.length > 0) {
            // Handle backspace in query
            setSlashQuery(prev => prev.slice(0, -1));
            setSelectedCommandIndex(-1);
            setIsKeyboardNavigation(false);
          } else {
            // If query is empty, close slash commands
            setShowSlashCommands(false);
            setSelectedCommandIndex(-1);
            setIsKeyboardNavigation(false);
          }
        }
      }
    };

    // Use a timeout to ensure the view is ready
    const setupListener = () => {
      try {
        const editorDom = editor.view?.dom;
        if (editorDom) {
          editorDom.addEventListener('keydown', handleKeyDown, true);
          return () => {
            editorDom.removeEventListener('keydown', handleKeyDown, true);
          };
        }
      } catch (e) {
        // Editor view not ready yet, will retry
        console.debug('Editor view not ready yet');
      }
      return undefined;
    };

    // Try to set up the listener immediately
    let cleanup = setupListener();

    // If it didn't work, retry after a short delay
    if (!cleanup) {
      const timer = setTimeout(() => {
        cleanup = setupListener();
      }, 100);

      return () => {
        clearTimeout(timer);
        if (cleanup) cleanup();
      };
    }

    return cleanup;
  }, [editor, showSlashCommands, slashQuery, selectedCommandIndex]);

  // Auto-scroll to selected command
  useEffect(() => {
    if (selectedCommandIndex >= 0 && isKeyboardNavigation && showSlashCommands) {
      const selectedElement = document.querySelector(`[data-command-index="${selectedCommandIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [selectedCommandIndex, isKeyboardNavigation, showSlashCommands]);

  // Handle paste event for images
  useEffect(() => {
    if (!editor) return;

    const handlePaste = async (event: ClipboardEvent) => {
      if (!event.clipboardData?.items) return;

      for (let i = 0; i < event.clipboardData.items.length; i++) {
        const item = event.clipboardData.items[i];

        if (item.type.indexOf('image') === 0) {
          event.preventDefault();

          try {
            setIsUploadingImage(true);

            const file = item.getAsFile();
            if (!file) continue;

            const imageUrl = await uploadImage(file);
            editor.chain().focus().setImage({ src: imageUrl }).run();
          } catch (error) {
            console.error('Error handling pasted image:', error);
          } finally {
            setIsUploadingImage(false);
          }
          break;
        }
      }
    };

    const handleDrop = async (event: DragEvent) => {
      if (!event.dataTransfer?.files) return;

      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        const file = event.dataTransfer.files[i];

        if (file.type.indexOf('image') === 0) {
          event.preventDefault();

          try {
            setIsUploadingImage(true);

            const imageUrl = await uploadImage(file);
            editor.chain().focus().setImage({ src: imageUrl }).run();
          } catch (error) {
            console.error('Error handling dropped image:', error);
          } finally {
            setIsUploadingImage(false);
          }
          break;
        }
      }
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const editorElement = editorContainerRef.current;

    if (editorElement) {
      editorElement.addEventListener('paste', handlePaste);
      editorElement.addEventListener('drop', handleDrop);
      editorElement.addEventListener('dragover', handleDragOver);

      return () => {
        editorElement.removeEventListener('paste', handlePaste);
        editorElement.removeEventListener('drop', handleDrop);
        editorElement.removeEventListener('dragover', handleDragOver);
      };
    }
  }, [editor]);

  const executeSlashCommand = useCallback((command: string) => {
    if (!editor) return;

    setShowSlashCommands(false);

    // Save current position before any deletions
    const currentPos = editor.state.selection.from;

    // Remove the literal "/<query>" only if it actually exists before the cursor
    if (slashQuery?.length) {
      const { from } = editor.state.selection;
      const start = Math.max(0, from - (slashQuery.length + 1));
      const preceding = editor.state.doc.textBetween(start, from, "\n");
      if (preceding === `/${slashQuery}`) {
        editor.chain().deleteRange({ from: start, to: from }).run();
      }
    }

    // color: open palette and exit
    if (command === 'color') {
      const { from } = editor.state.selection;
      const pos = editor.view.coordsAtPos(from);
      setColorPalettePosition({ top: pos.top + 30, left: pos.left });
      setShowColorPalette(true);
      setSlashQuery('');
      return;
    }

    // Apply command at current selection
    const chain = editor.chain();

    switch (command) {
      case 'paragraph':
        chain.setParagraph().run();
        break;
      case 'heading1': {
        chain.setHeading({ level: 1 }).run();
        break;
      }
      case 'heading2': {
        chain.setHeading({ level: 2 }).run();
        break;
      }
      case 'heading3': {
        chain.setHeading({ level: 3 }).run();
        break;
      }
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'codeBlock':
        chain.toggleCodeBlock().run();
        break;
      case 'horizontalRule':
        chain.setHorizontalRule().run();
        break;
      case 'table':
        chain.insertTable({ rows: 4, cols: 4, withHeaderRow: true }).run();
        break;
      default:
        break;
    }

    setSlashQuery('');
    slashStartPosRef.current = null;
  }, [editor, slashQuery]);

  if (!editor) {
    return null;
  }

  const slashCommands = [
    { title: 'Text', icon: Type, command: 'paragraph' },
    { title: 'Heading 1', icon: Heading1, command: 'heading1' },
    { title: 'Heading 2', icon: Heading2, command: 'heading2' },
    { title: 'Heading 3', icon: Heading3, command: 'heading3' },
    { title: 'Bullet List', icon: List, command: 'bulletList' },
    { title: 'Numbered List', icon: ListOrdered, command: 'orderedList' },
    { title: 'Quote', icon: Quote, command: 'blockquote' },
    { title: 'Code Block', icon: Code, command: 'codeBlock' },
    { title: 'Table', icon: TableIcon, command: 'table' },
    { title: 'Color', icon: Palette, command: 'color' },
    { title: 'Divider', icon: Minus, command: 'horizontalRule' },
  ];

  const filteredCommands = slashCommands.filter(cmd =>
    cmd.title.toLowerCase().includes(slashQuery.toLowerCase())
  );

  return (
    <div className={cn("flex flex-col rounded-md p-0", className)}>
      <div
        className="flex-1 relative"
        ref={editorContainerRef}
        onClick={() => {
          if (editor) {
            editor.chain().focus().run();
          }
        }}
      >
        <DragHandle editor={editor}>
          <div className="drag-handle-container">
            <button
              onClick={handlePlusClick}
              onMouseDown={(e) => e.preventDefault()}
              className="drag-handle-plus"
              title="Add block"
            >
              <Plus size={20} />
            </button>
            <div className="drag-handle-dots ml-1" data-drag-handle>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </div>
          </div>
        </DragHandle>
        <EditorContent
          editor={editor}
          className={cn("w-full", {
            "has-slash-menu": showSlashCommands
          })}
        />

        {/* Overlay when uploading */}
        {isUploadingImage && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background border shadow-sm">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm">Uploading image...</span>
            </div>
          </div>
        )}

        {/* Slash commands popup */}
        {showSlashCommands && (
          <div
            style={{
              position: "absolute",
              top: `${slashPosition.top}px`,
              left: `${slashPosition.left}px`,
              zIndex: 9999,
            }}
            className="bg-background border rounded-lg shadow-lg p-2 min-w-[200px] max-h-[300px] overflow-y-auto"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="text-xs text-muted-foreground mb-2 px-2 font-medium">Commands</div>
            {filteredCommands.length > 0 ? (
              filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.command}
                  onClick={() => executeSlashCommand(cmd.command)}
                  onMouseEnter={() => setIsKeyboardNavigation(false)}
                  onMouseDown={(e) => e.preventDefault()}
                  className={`w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${selectedCommandIndex === index && isKeyboardNavigation
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                    }`}
                  data-command-index={index}
                >
                  <cmd.icon size={16} className="text-muted-foreground" />
                  <span>{cmd.title}</span>
                </button>
              ))
            ) : (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                No commands found for "{slashQuery}"
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .notion-editor {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          line-height: 1.6;
        }

        /* DragHandle Container Styles */
        .drag-handle-container {
          display: flex;
          align-items: center;
          gap: 0px;
        }

        /* Plus Button */
        .drag-handle-plus {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          transition: all 0.15s;
        }

        .drag-handle-plus:hover {
          background-color: #f3f4f6;
          color: #6b7280;
        }

        /* Drag Dots */
        .drag-handle-dots {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          color: #9ca3af;
          cursor: grab;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .drag-handle-dots:hover {
          background-color: #f3f4f6;
          color: #6b7280;
        }

        .drag-handle-dots:active {
          cursor: grabbing;
        }

        /* Dark mode */
        @media (prefers-color-scheme: dark) {
          .drag-handle-plus,
          .drag-handle-dots {
            color: #6b7280;
          }

          .drag-handle-plus:hover,
          .drag-handle-dots:hover {
            background-color: #374151;
            color: #d1d5db;
          }
        }

        /* Position adjustments for different elements */
        .ProseMirror p .drag-handle-container {
          top: 0;
        }

        .ProseMirror h1 .drag-handle-container {
          top: 4px;
        }

        .ProseMirror h2 .drag-handle-container {
          top: 2px;
        }

        .ProseMirror h3 .drag-handle-container {
          top: 1px;
        }

        .ProseMirror li .drag-handle-container {
          top: 0;
        }

        .ProseMirror blockquote .drag-handle-container {
          top: 0;
        }
        
        .notion-editor p {
          margin: 0.5em 0;
        }
        
        .notion-editor h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin: 1.5em 0 0.5em 0;
        }
        
        .notion-editor h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 1.25em 0 0.5em 0;
        }
        
        .notion-editor h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 1em 0 0.5em 0;
        }
        
        .notion-editor ul, .notion-editor ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }
        
        .notion-editor blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1em;
          margin: 1em 0;
          color: #6b7280;
        }
        
        .notion-editor code {
          background-color: #f3f4f6;
          padding: 0.125em 0.25em;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        
        .notion-editor pre {
          background-color: #f3f4f6;
          padding: 1em;
          border-radius: 0.5rem;
          overflow-x: auto;
        }
        
        .notion-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
        }
        
        .notion-editor table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
          table-layout: fixed;
          word-wrap: break-word;
        }
        
        .notion-editor th,
        .notion-editor td {
          border: 1px solid #e5e7eb;
          padding: 0.5rem;
          text-align: left;
          vertical-align: top;
          word-wrap: break-word;
          overflow-wrap: break-word;
          max-width: 200px;
          min-width: 100px;
        }
        
        .notion-editor th {
          background-color: #f9fafb;
          font-weight: 600;
          white-space: nowrap;
        }
        
        .notion-editor tr:nth-child(even) {
          background-color: #f9fafb;
        }
        
        .notion-editor tr:hover {
          background-color: #f3f4f6;
        }
        
        .notion-editor table td,
        .notion-editor table th {
          position: relative;
        }
        
        .notion-editor table td:focus,
        .notion-editor table th:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }
        
        .notion-editor table {
          overflow-x: auto;
          display: block;
        }
        
        .notion-editor table tbody {
          display: table;
          width: 100%;
        }
        
        .notion-editor [style*="color"] {
          transition: color 0.2s ease;
        }
        
        .notion-editor .ProseMirror-selectednode {
          outline: 2px solid #3b82f6;
        }

        /* Enhanced Placeholder Styles - Shows on every empty block */
        .notion-editor .ProseMirror p.is-empty::before {
          content: attr(data-placeholder);
          position: absolute;
          color: #9ca3af;
          pointer-events: none;
          opacity: 0.6;
          font-style: normal;
          user-select: none;
          top: 0;
          left: 0;
        }

        /* Heading placeholders */
        .notion-editor .ProseMirror h1.is-empty::before {
          content: attr(data-placeholder);
          position: absolute;
          color: #9ca3af;
          opacity: 0.6;
          font-style: normal;
          font-weight: normal;
          font-size: 1.875rem !important;
          pointer-events: none;
          user-select: none;
          top: 0;
          left: 0;
        }

        .notion-editor .ProseMirror h2.is-empty::before {
          content: attr(data-placeholder);
          position: absolute;
          color: #9ca3af;
          opacity: 0.6;
          font-style: normal;
          font-weight: normal;
          font-size: 1.5rem !important;
          pointer-events: none;
          user-select: none;
          top: 0;
          left: 0;
        }

        .notion-editor .ProseMirror h3.is-empty::before {
          content: attr(data-placeholder);
          position: absolute;
          color: #9ca3af;
          opacity: 0.6;
          font-style: normal;
          font-weight: normal;
          font-size: 1.25rem !important;
          pointer-events: none;
          user-select: none;
          top: 0;
          left: 0;
        }

        /* List item placeholders */
        .notion-editor .ProseMirror li p.is-empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          opacity: 0.6;
          font-style: normal;
          position: absolute;
          pointer-events: none;
          user-select: none;
        }

        /* Blockquote placeholders */
        .notion-editor .ProseMirror blockquote p.is-empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          opacity: 0.6;
          font-style: normal;
          position: absolute;
          pointer-events: none;
          user-select: none;
        }

        /* Make sure empty nodes have relative positioning */
        .notion-editor .ProseMirror .is-empty {
          position: relative;
          min-height: 1.5em;
        }

        /* Hide placeholder when slash command menu is visible */
        .notion-editor.has-slash-menu .ProseMirror .is-empty::before {
          opacity: 0;
        }

        /* Focus state - slightly dimmer placeholder */
        .notion-editor .ProseMirror:focus .is-empty::before {
          opacity: 0.4;
        }

        /* Dark mode adjustments */
        @media (prefers-color-scheme: dark) {
          .notion-editor .ProseMirror .is-empty::before {
            color: #6b7280;
          }
          
          .notion-editor blockquote {
            border-left-color: #374151;
            color: #9ca3af;
          }
          
          .notion-editor code {
            background-color: #374151;
          }
          
          .notion-editor pre {
            background-color: #374151;
          }
          
          .notion-editor th,
          .notion-editor td {
            border-color: #374151;
          }
          
          .notion-editor th {
            background-color: #374151;
          }
          
          .notion-editor tr:nth-child(even) {
            background-color: #1f2937;
          }
          
          .notion-editor tr:hover {
            background-color: #374151;
          }
        }
      `}</style>

            {/* Color Palette Fixed */}
      {showColorPalette && (
        <div
          style={{ 
            position: "fixed",
            top: `${colorPalettePosition.top}px`,
            left: `${colorPalettePosition.left}px`,
            zIndex: 9999,
            border: "1px solid #4b5563",
            outline: "none"
          }}
          className="bg-neutral-800 rounded-lg shadow-lg p-4 w-[320px] color-palette-container"
          onMouseDown={(e) => e.preventDefault()}
        >
          <InlineColorPalette
            value={selectedColor}
            onChange={(color: string) => {
              setSelectedColor(color);
              if (editor) {
                editor.chain().focus().setColor(color).run();
              }
              setShowColorPalette(false);
            }}
            onClose={() => setShowColorPalette(false)}
          />
        </div>
      )}
    </div>
  );
}