"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import Heading from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { NodeViewRenderer, NodeViewRendererProps } from "@tiptap/react";
import { Extension } from "@tiptap/core";
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
  Code,
  CheckSquare,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Hash,
  Minus,
  Plus,
  MoreHorizontal,
  Columns,
  Rows,
  Trash2,
  Palette,
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
import { uploadImage } from "@/utils/cloudinary";
import { mergeAttributes } from '@tiptap/core'
import { Node as TiptapNode } from '@tiptap/core'
import { ColorPalette } from "@/components/ui/color-palette";
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

// BASIT SLASH COMMAND HANDLER - MANUAL PLACEHOLDER İLE UYUMLU
const handleSlashCommand = (editor: Editor, command: string) => {
  let result = false;
  
  switch (command) {
    case 'paragraph':
      result = editor.chain().focus().setNode('paragraph').run();
      break;
    case 'heading1':
      result = editor.chain().focus().setNode('heading', { level: 1 }).run();
      break;
    case 'heading2':
      result = editor.chain().focus().setNode('heading', { level: 2 }).run();
      break;
    case 'heading3':
      result = editor.chain().focus().setNode('heading', { level: 3 }).run();
      break;
    case 'bulletList':
      return editor.chain().focus().toggleBulletList().run();
    case 'orderedList':
      return editor.chain().focus().toggleOrderedList().run();
    case 'blockquote':
      result = editor.chain().focus().toggleBlockquote().run();
      break;
    case 'codeBlock':
      result = editor.chain().focus().toggleCodeBlock().run();
      break;
    case 'horizontalRule':
      return editor.chain().focus().setHorizontalRule().run();
    case 'table':
      return editor.chain().focus().insertTable({ rows: 4, cols: 4, withHeaderRow: true }).run();
    case 'color':
      return editor.chain().focus().setColor('rgba(59, 130, 246, 1)').run();
    default:
      return false;
  }
  
  return result;
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
  placeholder = "Write, press '/' for commands...",
  className = "",
  minHeight = "150px",
  maxHeight = "400px",
}: NotionEditorProps) {

  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  
  // Keyboard navigation for slash commands
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
  
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const initialContentRef = useRef(initialValue || content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // We'll add our own heading config
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
      // MANUAL PLACEHOLDER - TİPTAP PLACEHOLDER KAPALI
      Placeholder.configure({
        placeholder: () => '', // Hiçbir placeholder gösterme
        emptyEditorClass: 'is-editor-empty',
        showOnlyWhenEditable: false,
        showOnlyCurrent: true,
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

  // Handle content updates
  useEffect(() => {
    if (editor && content !== undefined && content !== editor.getHTML()) {
      const contentToSet = content || '<p></p>';
      editor.commands.setContent(contentToSet, { emitUpdate: false });
    }
  }, [editor, content]);

  // Auto-focus editor when it's ready
  useEffect(() => {
    if (editor) {
      // Small delay to ensure the editor is fully rendered
      setTimeout(() => {
        editor.commands.focus();
      }, 100);
    }
  }, [editor]);

  // Handle slash commands
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/') {
        // Only show slash commands at the start of a line or after whitespace
        const { from } = editor.state.selection;
        const $from = editor.state.doc.resolve(from);
        const beforeChar = $from.nodeBefore?.textContent?.slice(-1) || '';
        const isAtLineStart = from === $from.start($from.depth);
        
        if (isAtLineStart || beforeChar === ' ' || beforeChar === '\n') {
          // Prevent the slash from being inserted into the editor
          event.preventDefault();
          
          const domPosition = editor.view.coordsAtPos(from);
          const editorContainer = editor.view.dom.getBoundingClientRect();
          
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

    editor.view.dom.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    
    return () => {
      editor.view.dom.removeEventListener('keydown', handleKeyDown, true);
    };
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

  const addLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: linkUrl })
      .run();
    
    setLinkUrl('');
    setShowLinkPopover(false);
  }, [editor, linkUrl]);

  const addImage = useCallback(() => {
    if (!editor || !imageUrl) return;
    
    editor
      .chain()
      .focus()
      .setImage({ src: imageUrl })
      .run();
    
    setImageUrl('');
    setShowImagePopover(false);
  }, [editor, imageUrl]);

    const executeSlashCommand = useCallback((command: string) => {
    if (!editor) return;
    
    setShowSlashCommands(false);
    
    // Since we prevented the slash from being inserted, we just need to
    // delete any query text that was typed after the slash
    if (slashQuery && slashQuery.length > 0) {
      const { from } = editor.state.selection;
      const queryLength = slashQuery.length;
      
      // Delete the query text
      editor.chain()
        .focus()
        .deleteRange({ from: from - queryLength, to: from })
        .run();
    }
    
    // Execute the command immediately
    handleSlashCommand(editor, command);
    
    // Reset query
    setSlashQuery('');
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
        style={{ cursor: 'text' }}
      >
        <EditorContent editor={editor} className="w-full" />
        
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
          >
            <div className="text-xs text-muted-foreground mb-2 px-2 font-medium">Commands</div>
            {filteredCommands.length > 0 ? (
              filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.command}
                  onClick={() => executeSlashCommand(cmd.command)}
                  onMouseEnter={() => setIsKeyboardNavigation(false)}
                  className={`w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${
                    selectedCommandIndex === index && isKeyboardNavigation
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

        /* MANUAL PLACEHOLDER SİSTEMİ - KAYMA YOK */
        .notion-editor .ProseMirror p:empty::before {
          content: 'Write, press "/" for commands...';
          position: absolute;
          color: #9ca3af;
          pointer-events: none;
          opacity: 0.6;
          font-style: italic;
          user-select: none;
        }

        /* İlk paragraf değilse farklı placeholder */
        .notion-editor .ProseMirror p:not(:first-child):empty::before {
          content: 'Write, press "/" for commands...';
        }

        /* HEADİNG PLACEHOLDER'LARI - MANUAL */
        .notion-editor .ProseMirror h1:empty::before {
          content: 'Heading 1';
          position: absolute;
          color: #9ca3af;
          opacity: 0.6;
          font-style: italic;
          font-weight: normal;
          pointer-events: none;
          user-select: none;
        }

        .notion-editor .ProseMirror h2:empty::before {
          content: 'Heading 2';
          position: absolute;
          color: #9ca3af;
          opacity: 0.6;
          font-style: italic;
          font-weight: normal;
          pointer-events: none;
          user-select: none;
        }

        .notion-editor .ProseMirror h3:empty::before {
          content: 'Heading 3';
          position: absolute;
          color: #9ca3af;
          opacity: 0.6;
          font-style: italic;
          font-weight: normal;
          pointer-events: none;
          user-select: none;
        }

        /* Liste item'ları için placeholder */
        .notion-editor .ProseMirror li p:empty::before {
          content: 'List item';
          color: #9ca3af;
          opacity: 0.6;
          font-style: italic;
          position: absolute;
          pointer-events: none;
          user-select: none;
        }

        /* Focus durumunda placeholder'ları biraz daha soluk göster */
        .notion-editor .ProseMirror:focus p:empty::before,
        .notion-editor .ProseMirror:focus h1:empty::before,
        .notion-editor .ProseMirror:focus h2:empty::before,
        .notion-editor .ProseMirror:focus h3:empty::before {
          opacity: 0.4;
        }

        /* Dark mode için */
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
    </div>
  );
}