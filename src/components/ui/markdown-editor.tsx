"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Heading from "@tiptap/extension-heading";
import Color from "@tiptap/extension-color";
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
  Undo,
  Redo,
  Code,
  WandSparkles,
  Loader2,
  RefreshCw,
  AtSign,
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
import { type User, MentionSuggestion } from "@/components/ui/mention-suggestion";
import { type Task, TaskMentionSuggestion } from "@/components/ui/task-mention-suggestion";
import { type Epic, EpicMentionSuggestion } from "@/components/ui/epic-mention-suggestion";
import { type Story, StoryMentionSuggestion } from "@/components/ui/story-mention-suggestion";
import { type Milestone, MilestoneMentionSuggestion } from "@/components/ui/milestone-mention-suggestion";
import { CommandMenu, type CommandOption } from "@/components/ui/command-menu";
import { useWorkspace } from "@/context/WorkspaceContext";
import { mergeAttributes } from '@tiptap/core'
import { Node as TiptapNode } from '@tiptap/core'

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

// Custom Image extension with resize functionality
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
      // Keep track of the original image dimensions
      originalWidth: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      originalHeight: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },
  addNodeView() {
    return ((props: NodeViewRendererProps) => {
      const { node, editor, getPos } = props;
      const { src, alt, title, width, height } = node.attrs;
      
      // Create the container element
      const container = document.createElement('div');
      container.classList.add('image-resizable-container');
      
      // Create the image element
      const img = document.createElement('img');
      img.src = src;
      if (alt) img.alt = alt;
      if (title) img.title = title;
      if (width) img.width = width;
      if (height) img.height = height;
      
      img.classList.add('resizable-image');
      img.style.cursor = 'pointer';
      
      // Add a tooltip to show resize instructions
      const tooltip = document.createElement('div');
      tooltip.className = 'image-tooltip';
      tooltip.textContent = '✨ Drag corners to resize • Click to view full size';
      container.appendChild(tooltip);
      
      // Make image resizable
      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startWidth = 0;
      let startHeight = 0;
      
      // Add click handler to open full size image in new tab/window
      img.addEventListener('click', () => {
        if (isResizing) return;
        // Open image in new tab
        window.open(src, '_blank');
      });
      
      // Create resize handles
      const handles = ['se', 'sw', 'ne', 'nw', 'n', 's', 'e', 'w'];
      handles.forEach(handlePos => {
        const handle = document.createElement('div');
        handle.classList.add('resize-handle', `handle-${handlePos}`);
        handle.style.position = 'absolute';
        handle.style.width = '8px';
        handle.style.height = '8px';
        handle.style.backgroundColor = 'hsl(var(--background))';
        handle.style.border = '1px solid hsl(var(--primary))';
        handle.style.zIndex = '2';
        
        // Position the handle based on its position code
        switch(handlePos) {
          case 'se': // bottom-right
            handle.style.bottom = '-4px';
            handle.style.right = '-4px';
            handle.style.cursor = 'nwse-resize';
            break;
          case 'sw': // bottom-left
            handle.style.bottom = '-4px';
            handle.style.left = '-4px';
            handle.style.cursor = 'nesw-resize';
            break;
          case 'ne': // top-right
            handle.style.top = '-4px';
            handle.style.right = '-4px';
            handle.style.cursor = 'nesw-resize';
            break;
          case 'nw': // top-left
            handle.style.top = '-4px';
            handle.style.left = '-4px';
            handle.style.cursor = 'nwse-resize';
            break;
          case 'n': // top-center
            handle.style.top = '-4px';
            handle.style.left = '50%';
            handle.style.transform = 'translateX(-50%)';
            handle.style.cursor = 'ns-resize';
            break;
          case 's': // bottom-center
            handle.style.bottom = '-4px';
            handle.style.left = '50%';
            handle.style.transform = 'translateX(-50%)';
            handle.style.cursor = 'ns-resize';
            break;
          case 'e': // middle-right
            handle.style.top = '50%';
            handle.style.right = '-4px';
            handle.style.transform = 'translateY(-50%)';
            handle.style.cursor = 'ew-resize';
            break;
          case 'w': // middle-left
            handle.style.top = '50%';
            handle.style.left = '-4px';
            handle.style.transform = 'translateY(-50%)';
            handle.style.cursor = 'ew-resize';
            break;
        }
        
        // Only show handles when image is hovered
        handle.style.display = 'none';
        
        // Add resize functionality
        handle.addEventListener('mousedown', (e: MouseEvent) => {
          isResizing = true;
          startX = e.clientX;
          startY = e.clientY;
          startWidth = img.width;
          startHeight = img.height;
          
          // Add event listeners to handle resize
          document.addEventListener('mousemove', handleResize);
          document.addEventListener('mouseup', stopResize);
          
          // Prevent default behavior and propagation
          e.preventDefault();
          e.stopPropagation();
        });
        
        const handleResize = (e: MouseEvent) => {
          if (!isResizing) return;
          
          // Calculate new dimensions based on handle position
          let newWidth = startWidth;
          let newHeight = startHeight;
          
          // Determine resize behavior based on handle position
          if (handlePos.includes('e')) {
            newWidth = startWidth + (e.clientX - startX);
          } else if (handlePos.includes('w')) {
            newWidth = startWidth - (e.clientX - startX);
          }
          
          if (handlePos.includes('s')) {
            newHeight = startHeight + (e.clientY - startY);
          } else if (handlePos.includes('n')) {
            newHeight = startHeight - (e.clientY - startY);
          }
          
          // Maintain aspect ratio by default (unless shift key is pressed)
          if (!e.shiftKey) {
            const ratio = startWidth / startHeight;
            // Determine which dimension is dominant in this resize operation
            const widthDominant = Math.abs(newWidth / startWidth - 1) > Math.abs(newHeight / startHeight - 1);
            
            if (widthDominant) {
              newHeight = newWidth / ratio;
            } else {
              newWidth = newHeight * ratio;
            }
          }
          
          // Apply size limits
          newWidth = Math.max(30, newWidth);  // min width 30px
          newHeight = Math.max(30, newHeight); // min height 30px
          
          // Update image dimensions
          img.width = Math.round(newWidth);
          img.height = Math.round(newHeight);
          
          // Update the node attributes for persistence
          if (typeof getPos === 'function') {
            editor.commands.command(({ tr }) => {
              tr.setNodeMarkup(getPos(), undefined, { 
                ...node.attrs, 
                width: Math.round(newWidth),
                height: Math.round(newHeight),
              });
              return true;
            });
          }
        };
        
        const stopResize = () => {
          isResizing = false;
          document.removeEventListener('mousemove', handleResize);
          document.removeEventListener('mouseup', stopResize);
        };
        
        container.appendChild(handle);
      });
      
      // Show handles on hover, hide on mouseout
      container.addEventListener('mouseenter', () => {
        if (!isResizing) {
          container.querySelectorAll('.resize-handle').forEach(handle => {
            (handle as HTMLElement).style.display = 'block';
          });
        }
      });
      
      container.addEventListener('mouseleave', () => {
        if (!isResizing) {
          container.querySelectorAll('.resize-handle').forEach(handle => {
            (handle as HTMLElement).style.display = 'none';
          });
        }
      });
      
      // Set container styles
      container.style.position = 'relative';
      container.style.display = 'inline-block';
      container.style.lineHeight = '0';
      
      // Add image to container
      container.appendChild(img);
      
      // Store original dimensions if not already set
      if (!node.attrs.originalWidth || !node.attrs.originalHeight) {
        img.onload = () => {
          const originalWidth = img.naturalWidth;
          const originalHeight = img.naturalHeight;
          
          if (typeof getPos === 'function') {
            editor.commands.command(({ tr }) => {
              tr.setNodeMarkup(getPos(), undefined, { 
                ...node.attrs, 
                originalWidth,
                originalHeight,
              });
              return true;
            });
          }
        };
      }
      
      return {
        dom: container,
        update: (updatedNode) => {
          // Update only if src has changed
          if (updatedNode.attrs.src !== img.src) {
            img.src = updatedNode.attrs.src;
          }
          if (updatedNode.attrs.width) img.width = updatedNode.attrs.width;
          if (updatedNode.attrs.height) img.height = updatedNode.attrs.height;
          return true;
        },
        destroy: () => {
          // Clean up event listeners
          img.onload = null;
        }
      };
    }) as NodeViewRenderer;
  },
});

// Apply image CSS
const imageCSS = `
.image-resizable-container {
  display: inline-block;
  position: relative;
  line-height: 0;
  transition: all 0.2s ease;
  margin: 2px;
}
.resizable-image {
  display: block;
  max-width: 100%;
  height: auto;
  transition: all 0.25s ease;
  border-radius: 4px;
  box-shadow: 0 1px 3px hsl(var(--foreground) / 0.1);
  border: 1px solid hsl(var(--border) / 0.5);
}
.image-resizable-container:hover .resizable-image {
  filter: brightness(0.98);
  box-shadow: 0 2px 8px hsl(var(--foreground) / 0.15);
  border-color: hsl(var(--primary) / 0.3);
}
.resize-handle {
  position: absolute;
  width: 9px;
  height: 9px;
  background-color: hsl(var(--background));
  border: 1.5px solid hsl(var(--primary) / 0.8);
  border-radius: 50%;
  z-index: 2;
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.2s ease, transform 0.15s ease, background-color 0.15s ease;
  box-shadow: 0 1px 2px hsl(var(--foreground) / 0.1);
}
.image-resizable-container:hover .resize-handle {
  opacity: 1;
  transform: scale(1);
}
.resize-handle:hover {
  background-color: hsl(var(--primary) / 0.9);
  border-color: hsl(var(--background));
  transform: scale(1.2);
}
.resize-handle:active {
  background-color: hsl(var(--primary));
  transform: scale(1.3);
}
.image-tooltip {
  position: absolute;
  top: -38px;
  left: 50%;
  transform: translateX(-50%);
  background-color: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.2px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 3;
  box-shadow: 0 4px 8px hsl(var(--foreground) / 0.1);
  transform: translateX(-50%) translateY(5px);
}
.image-resizable-container:hover .image-tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.image-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -6px;
  border-width: 6px;
  border-style: solid;
  border-color: hsl(var(--popover)) transparent transparent transparent;
}
`;

// Extension to add custom CSS to the editor
const CustomCSS = Extension.create({
  name: 'customCSS',
  addOptions() {
    return {
      css: imageCSS,
    };
  },
  onCreate() {
    const style = document.createElement('style');
    style.setAttribute('data-tiptap-custom-css', '');
    style.textContent = this.options.css;
    document.head.appendChild(style);
  },
  onDestroy() {
    const style = document.querySelector('[data-tiptap-custom-css]');
    if (style) {
      style.remove();
    }
  },
});

// Define a Mention extension for TipTap
const Mention = TiptapNode.create({
  name: 'mention',
  
  group: 'inline',
  
  inline: true,
  
  selectable: false,
  
  atom: true,
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          
          return {
            'data-id': attributes.id,
          }
        },
      },
      
      name: {
        default: null,
        parseHTML: element => element.getAttribute('data-name'),
        renderHTML: attributes => {
          if (!attributes.name) {
            return {}
          }
          
          return {
            'data-name': attributes.name,
          }
        },
      },
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
        getAttrs: element => {
          // Try multiple attribute formats for backwards compatibility
          const id = element.getAttribute('data-user-id') || element.getAttribute('data-id')
          const name = element.getAttribute('data-user-name') || element.getAttribute('data-name') || element.textContent?.replace('@', '')
          

          
          if (!id || !name) {
            return false
          }
          
          return { id, name }
        },
      },
    ]
  },
  
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { 'data-mention': true, class: 'mention' },
        HTMLAttributes,
      ),
      [
        'span',
        { class: 'mention-symbol' },
        '@',
      ],
      node.attrs.name,
    ]
  },
  
  renderText({ node }) {
    return `@[${node.attrs.name}](${node.attrs.id})`
  },
})

// Define a TaskMention extension for TipTap
const TaskMention = TiptapNode.create({
  name: 'taskMention',
  
  group: 'inline',
  
  inline: true,
  
  selectable: false,
  
  atom: true,
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          
          return {
            'data-id': attributes.id,
          }
        },
      },
      
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {}
          }
          
          return {
            'data-title': attributes.title,
          }
        },
      },

      issueKey: {
        default: null,
        parseHTML: element => element.getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) {
            return {}
          }
          
          return {
            'data-issue-key': attributes.issueKey,
          }
        },
      },
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[data-task-mention]',
        getAttrs: element => {
          // Try multiple attribute formats for backwards compatibility
          const id = element.getAttribute('data-task-id') || element.getAttribute('data-id')
          const title = element.getAttribute('data-task-title') || element.getAttribute('data-title') || element.textContent?.replace('#', '')
          const issueKey = element.getAttribute('data-task-issue-key') || element.getAttribute('data-issue-key') || ''
          
          if (!id || !title) {
            return false
          }
          
          return { id, title, issueKey }
        },
      },
    ]
  },
  
  renderHTML({ node, HTMLAttributes }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes(
        { 'data-task-mention': true, class: 'task-mention' },
        HTMLAttributes,
      ),
      [
        'span',
        { class: 'mention-symbol' },
        '#',
      ],
      displayText,
    ]
  },
  
  renderText({ node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return `#[${displayText}](${node.attrs.id})`
  },
})

// Define an EpicMention extension for TipTap
const EpicMention = TiptapNode.create({
  name: 'epicMention',
  
  group: 'inline',
  
  inline: true,
  
  selectable: false,
  
  atom: true,
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          
          return {
            'data-id': attributes.id,
          }
        },
      },
      
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {}
          }
          
          return {
            'data-title': attributes.title,
          }
        },
      },

      issueKey: {
        default: null,
        parseHTML: element => element.getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) {
            return {}
          }
          
          return {
            'data-issue-key': attributes.issueKey,
          }
        },
      },
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[data-epic-mention]',
        getAttrs: element => {
          // Try multiple attribute formats for backwards compatibility
          const id = element.getAttribute('data-epic-id') || element.getAttribute('data-id')
          const title = element.getAttribute('data-epic-title') || element.getAttribute('data-title') || element.textContent?.replace('~', '')
          const issueKey = element.getAttribute('data-epic-issue-key') || element.getAttribute('data-issue-key') || ''
          
          if (!id || !title) {
            return false
          }
          
          return { id, title, issueKey }
        },
      },
    ]
  },
  
  renderHTML({ node, HTMLAttributes }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes(
        { 'data-epic-mention': true, class: 'epic-mention' },
        HTMLAttributes,
      ),
      [
        'span',
        { class: 'mention-symbol' },
        '~',
      ],
      displayText,
    ]
  },
  
  renderText({ node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return `~[${displayText}](${node.attrs.id})`
  },
})

// Define a StoryMention extension for TipTap
const StoryMention = TiptapNode.create({
  name: 'storyMention',
  
  group: 'inline',
  
  inline: true,
  
  selectable: false,
  
  atom: true,
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          
          return {
            'data-id': attributes.id,
          }
        },
      },
      
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {}
          }
          
          return {
            'data-title': attributes.title,
          }
        },
      },

      issueKey: {
        default: null,
        parseHTML: element => element.getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) {
            return {}
          }
          
          return {
            'data-issue-key': attributes.issueKey,
          }
        },
      },
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[data-story-mention]',
        getAttrs: element => {
          // Try multiple attribute formats for backwards compatibility
          const id = element.getAttribute('data-story-id') || element.getAttribute('data-id')
          const title = element.getAttribute('data-story-title') || element.getAttribute('data-title') || element.textContent?.replace('^', '')
          const issueKey = element.getAttribute('data-story-issue-key') || element.getAttribute('data-issue-key') || ''
          
          if (!id || !title) {
            return false
          }
          
          return { id, title, issueKey }
        },
      },
    ]
  },
  
  renderHTML({ node, HTMLAttributes }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes(
        { 'data-story-mention': true, class: 'story-mention' },
        HTMLAttributes,
      ),
      [
        'span',
        { class: 'mention-symbol' },
        '^',
      ],
      displayText,
    ]
  },
  
  renderText({ node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return `^[${displayText}](${node.attrs.id})`
  },
})

// Define a MilestoneMention extension for TipTap
const MilestoneMention = TiptapNode.create({
  name: 'milestoneMention',
  
  group: 'inline',
  
  inline: true,
  
  selectable: false,
  
  atom: true,
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          
          return {
            'data-id': attributes.id,
          }
        },
      },
      
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {}
          }
          
          return {
            'data-title': attributes.title,
          }
        },
      },

      issueKey: {
        default: null,
        parseHTML: element => element.getAttribute('data-issue-key'),
        renderHTML: attributes => {
          if (!attributes.issueKey) {
            return {}
          }
          
          return {
            'data-issue-key': attributes.issueKey,
          }
        },
      },
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[data-milestone-mention]',
        getAttrs: element => {
          // Try multiple attribute formats for backwards compatibility
          const id = element.getAttribute('data-milestone-id') || element.getAttribute('data-id')
          const title = element.getAttribute('data-milestone-title') || element.getAttribute('data-title') || element.textContent?.replace('!', '')
          const issueKey = element.getAttribute('data-milestone-issue-key') || element.getAttribute('data-issue-key') || ''
          
          if (!id || !title) {
            return false
          }
          
          return { id, title, issueKey }
        },
      },
    ]
  },
  
  renderHTML({ node, HTMLAttributes }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return [
      'span',
      mergeAttributes(
        { 'data-milestone-mention': true, class: 'milestone-mention' },
        HTMLAttributes,
      ),
      [
        'span',
        { class: 'mention-symbol' },
        '!',
      ],
      displayText,
    ]
  },
  
  renderText({ node }) {
    const displayText = node.attrs.issueKey || node.attrs.title;
    return `![${displayText}](${node.attrs.id})`
  },
})

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
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showTaskMentions, setShowTaskMentions] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskMentionPosition, setTaskMentionPosition] = useState({ top: 0, left: 0 });
  
  // Command menu states
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandMenuPosition, setCommandMenuPosition] = useState({ top: 0, left: 0 });
  
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { currentWorkspace: workspaceData } = useWorkspace();

  // Use a stable reference for initialValue to prevent re-renders
  // Process initial content to convert text-based mentions to HTML
  const processInitialContent = useCallback((rawContent: string) => {
    if (!rawContent) return '';
    
    let processed = rawContent;
    
    // If content looks like text (contains mention patterns but not HTML), process it
    if (processed.includes('@[') || processed.includes('~[') || processed.includes('^[') || processed.includes('![') || processed.includes('#[')) {
      // Convert text-based mentions to HTML spans that Tiptap can parse
      
      // User mentions: @[name](id) -> HTML span
      processed = processed.replace(
        /@\[([^\]]+)\]\(([^)]+)\)/g,
        '<span data-mention data-user-id="$2" data-user-name="$1">@$1</span>'
      );
      
      // Epic mentions: ~[name](id) -> HTML span  
      processed = processed.replace(
        /~\[([^\]]+)\]\(([^)]+)\)/g,
        '<span data-epic-mention data-epic-id="$2" data-epic-title="$1" data-epic-issue-key="">~$1</span>'
      );
      
      // Story mentions: ^[name](id) -> HTML span
      processed = processed.replace(
        /\^\[([^\]]+)\]\(([^)]+)\)/g,
        '<span data-story-mention data-story-id="$2" data-story-title="$1" data-story-issue-key="">^$1</span>'
      );
      
      // Milestone mentions: ![name](id) -> HTML span  
      processed = processed.replace(
        /!\[([^\]]+)\]\(([^)]+)\)/g,
        '<span data-milestone-mention data-milestone-id="$2" data-milestone-title="$1" data-milestone-issue-key="">!$1</span>'
      );
      
      // Task mentions: #[name](id) -> HTML span
      processed = processed.replace(
        /#\[([^\]]+)\]\(([^)]+)\)/g,
        '<span data-task-mention data-task-id="$2" data-task-title="$1" data-task-issue-key="">#$1</span>'
      );
      
      // Convert newlines to <br> tags
      processed = processed.replace(/\n/g, '<br>');
    }
    
    return processed;
  }, []);

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
      // Replace Image with ResizableImage
      ResizableImage.configure({
        HTMLAttributes: {
          class: 'resizable-image',
        },
      }),
      CustomCSS.configure({ css: imageCSS }),
      Underline,
      Placeholder.configure({
        placeholder,
      }),
      TextStyle,
      Heading.configure({
        levels: [1, 2, 3],
      }),
      Color,
      Mention, // Add Mention extension
      TaskMention, // Add Task Mention extension
      EpicMention, // Add Epic Mention extension
      StoryMention, // Add Story Mention extension
      MilestoneMention, // Add Milestone Mention extension
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
      // Get the full HTML content for rendering
      const html = editor.getHTML();
      
      // Only pass HTML to the onChange handler
      onChange?.(html, html); // Passing html twice for compatibility, but second arg could be removed if forms are updated
    },
  }, []); // Empty dependency array to ensure editor only initializes once

  // Track user typing activity
  useEffect(() => {
    if (!editor) return;

    let typingTimer: NodeJS.Timeout | null = null;

    const handleKeyDown = () => {
      setIsUserTyping(true);
      // Clear existing timer
      if (typingTimer) {
        clearTimeout(typingTimer);
      }
      // Reset typing flag after a delay
      typingTimer = setTimeout(() => setIsUserTyping(false), 500);
    };

    const handleFocus = () => {
      setIsUserTyping(false); // Reset when editor gains focus
    };

    const editorDom = editor.view.dom;
    editorDom.addEventListener('keydown', handleKeyDown);
    editorDom.addEventListener('focus', handleFocus);

    return () => {
      editorDom.removeEventListener('keydown', handleKeyDown);
      editorDom.removeEventListener('focus', handleFocus);
      // Clear timer on cleanup
      if (typingTimer) {
        clearTimeout(typingTimer);
      }
    };
  }, [editor]);

  // Handle paste event for images
  useEffect(() => {
    if (!editor) return;

    const handlePaste = async (event: ClipboardEvent) => {
      // Check if items are available in clipboard
      if (!event.clipboardData?.items) return;
      
      // Look for image data in clipboard
      for (let i = 0; i < event.clipboardData.items.length; i++) {
        const item = event.clipboardData.items[i];
        
        // Check if the pasted content is an image
        if (item.type.indexOf('image') === 0) {
          // Prevent default paste behavior
          event.preventDefault();
          
          try {
            setIsUploadingImage(true);
            
            // Get the image file from clipboard
            const file = item.getAsFile();
            if (!file) continue;
            
            // Upload to Cloudinary
            const imageUrl = await uploadImage(file);
            
            // Insert the image into the editor
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
    
    // Handle drop event for images
    const handleDrop = async (event: DragEvent) => {
      if (!event.dataTransfer?.files) return;
      
      // Look for image files in the dropped data
      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        const file = event.dataTransfer.files[i];
        
        // Check if the dropped file is an image
        if (file.type.indexOf('image') === 0) {
          // Prevent default drop behavior
          event.preventDefault();
          
          try {
            setIsUploadingImage(true);
            
            // Upload to Cloudinary
            const imageUrl = await uploadImage(file);
            
            // Insert the image into the editor
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

    // Handle dragover event to enable dropping
    const handleDragOver = (event: DragEvent) => {
      // Prevent default to allow drop
      event.preventDefault();
    };

    // Get the DOM element of the editor
    const editorElement = editorContainerRef.current;
    
    if (editorElement) {
      // Add event listeners for paste and drop
      editorElement.addEventListener('paste', handlePaste);
      editorElement.addEventListener('drop', handleDrop);
      editorElement.addEventListener('dragover', handleDragOver);
      
      // Cleanup function
      return () => {
        editorElement.removeEventListener('paste', handlePaste);
        editorElement.removeEventListener('drop', handleDrop);
        editorElement.removeEventListener('dragover', handleDragOver);
      };
    }
  }, [editor]);

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

  // Add mention state
  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [caretPosition, setCaretPosition] = useState({ top: 0, left: 0 });
  const mentionSuggestionRef = useRef<HTMLDivElement>(null);
  
  // Add task mention state
  const [taskMentionQuery, setTaskMentionQuery] = useState("");
  const [showTaskMentionSuggestions, setShowTaskMentionSuggestions] = useState(false);
  const [taskCaretPosition, setTaskCaretPosition] = useState({ top: 0, left: 0 });
  const taskMentionSuggestionRef = useRef<HTMLDivElement>(null);
  
  // Add epic mention state
  const [epicMentionQuery, setEpicMentionQuery] = useState("");
  const [showEpicMentionSuggestions, setShowEpicMentionSuggestions] = useState(false);
  const [epicCaretPosition, setEpicCaretPosition] = useState({ top: 0, left: 0 });
  const epicMentionSuggestionRef = useRef<HTMLDivElement>(null);
  
  // Add story mention state
  const [storyMentionQuery, setStoryMentionQuery] = useState("");
  const [showStoryMentionSuggestions, setShowStoryMentionSuggestions] = useState(false);
  const [storyCaretPosition, setStoryCaretPosition] = useState({ top: 0, left: 0 });
  const storyMentionSuggestionRef = useRef<HTMLDivElement>(null);
  
  // Add milestone mention state
  const [milestoneMentionQuery, setMilestoneMentionQuery] = useState("");
  const [showMilestoneMentionSuggestions, setShowMilestoneMentionSuggestions] = useState(false);
  
  // Track if user is actively typing vs content being set programmatically
  const [isUserTyping, setIsUserTyping] = useState(false);
  

  const [milestoneCaretPosition, setMilestoneCaretPosition] = useState({ top: 0, left: 0 });
  const milestoneMentionSuggestionRef = useRef<HTMLDivElement>(null);
  
  // Add command menu ref
  const commandMenuRef = useRef<HTMLDivElement>(null);
  
  const { currentWorkspace } = useWorkspace();
  
  // Track the last time a mention was inserted
  const lastMentionInsertedRef = useRef<number>(0);

  // Insert a mention at cursor position
  const insertMention = useCallback((user: User) => {

    if (!editor) return;

    const { from } = editor.state.selection;
    const currentPosition = from;

    // --- Robustly find the position of the @ symbol --- //
    let atPosition = -1;
    // Search backwards from the cursor position
    const searchLimit = Math.max(0, currentPosition - 50); // Limit search to 50 chars back
    editor.state.doc.nodesBetween(searchLimit, currentPosition, (node, pos) => {
      if (atPosition !== -1) return false; // Stop if already found

      if (node.isText) {
        const nodeText = node.textContent || '';
        let searchFromIndex = currentPosition - pos - 1; // Start searching from the relative cursor position within the node
        let relativeAtPos = nodeText.lastIndexOf('@', searchFromIndex);

        while (relativeAtPos !== -1) {
          const absoluteAtPos = pos + relativeAtPos;
          // Ensure the found @ is within the search range and before the cursor
          if (absoluteAtPos >= searchLimit && absoluteAtPos < currentPosition) {
            // Check if there's a space or start of node right after the @
            // (to ensure we found the start of the mention query)
            const textAfterAt = editor.state.doc.textBetween(absoluteAtPos + 1, currentPosition, "");
            if (!textAfterAt.match(/^\s/) && textAfterAt.indexOf('@') === -1) { // Ensure no space and no other @ between trigger and cursor
              atPosition = absoluteAtPos;
              return false; // Stop searching
            }
          }
          // Continue searching backwards within the same text node
          searchFromIndex = relativeAtPos - 1;
          relativeAtPos = nodeText.lastIndexOf('@', searchFromIndex);
        }
      }
      return true; // Continue searching other nodes
    });
    // --- End of robust search --- //

    // Close suggestions immediately
    setShowMentionSuggestions(false);
    lastMentionInsertedRef.current = Date.now();

    // Proceed with deletion and insertion if @ was found
    if (atPosition !== -1) {
      // Delete from the found @ position to the current cursor position
      editor.chain().focus().deleteRange({
        from: atPosition,
        to: currentPosition
      }).run();

      // Insert the mention node where the @ was
      editor.chain().insertContentAt(atPosition, {
        type: 'mention',
        attrs: {
          id: user.id,
          name: user.name,
        },
      }).run();

      // Add space after the inserted mention node
      editor.chain().insertContentAt(atPosition + 1, ' ').focus().run(); // +1 because mention node itself has length 1

    } else {
      // Fallback: If no @ was found, insert the mention at the current cursor position
      // This might happen if suggestion was triggered in an unusual way
      editor.chain().focus().insertContent({
        type: 'mention',
        attrs: {
          id: user.id,
          name: user.name,
        },
      }).insertContent(' ').run();
    }
  }, [editor]);

  // Insert a task mention at cursor position
  const insertTaskMention = useCallback((task: Task) => {
    if (!editor) return;

    const { from } = editor.state.selection;
    const currentPosition = from;

    // --- Robustly find the position of the # symbol --- //
    let hashPosition = -1;
    // Search backwards from the cursor position
    const searchLimit = Math.max(0, currentPosition - 50); // Limit search to 50 chars back
    editor.state.doc.nodesBetween(searchLimit, currentPosition, (node, pos) => {
      if (hashPosition !== -1) return false; // Stop if already found

      if (node.isText) {
        const nodeText = node.textContent || '';
        let searchFromIndex = currentPosition - pos - 1; // Start searching from the relative cursor position within the node
        let relativeHashPos = nodeText.lastIndexOf('#', searchFromIndex);

        while (relativeHashPos !== -1) {
          const absoluteHashPos = pos + relativeHashPos;
          // Ensure the found # is within the search range and before the cursor
          if (absoluteHashPos >= searchLimit && absoluteHashPos < currentPosition) {
            // Check if there's a space or start of node right after the #
            // (to ensure we found the start of the mention query)
            const textAfterHash = editor.state.doc.textBetween(absoluteHashPos + 1, currentPosition, "");
            if (!textAfterHash.match(/^\s/) && textAfterHash.indexOf('#') === -1) { // Ensure no space and no other # between trigger and cursor
              hashPosition = absoluteHashPos;
              return false; // Stop searching
            }
          }
          // Continue searching backwards within the same text node
          searchFromIndex = relativeHashPos - 1;
          relativeHashPos = nodeText.lastIndexOf('#', searchFromIndex);
        }
      }
      return true; // Continue searching other nodes
    });
    // --- End of robust search --- //

    // Close suggestions immediately
    setShowTaskMentionSuggestions(false);

    // Proceed with deletion and insertion if # was found
    if (hashPosition !== -1) {
      // Delete from the found # position to the current cursor position
      editor.chain().focus().deleteRange({
        from: hashPosition,
        to: currentPosition
      }).run();

      // Insert the task mention node where the # was
      editor.chain().insertContentAt(hashPosition, {
        type: 'taskMention',
        attrs: {
          id: task.id,
          title: task.title,
          issueKey: task.issueKey,
        },
      }).run();

      // Add space after the inserted mention node
      editor.chain().insertContentAt(hashPosition + 1, ' ').focus().run(); // +1 because mention node itself has length 1

    } else {
      // Fallback: If no # was found, insert the task mention at the current cursor position
      // This might happen if suggestion was triggered in an unusual way
      editor.chain().focus().insertContent({
        type: 'taskMention',
        attrs: {
          id: task.id,
          title: task.title,
          issueKey: task.issueKey,
        },
      }).insertContent(' ').run();
    }
  }, [editor]);

  // Insert an epic mention at cursor position
  const insertEpicMention = useCallback((epic: Epic) => {
    if (!editor) return;

    const { from } = editor.state.selection;
    const currentPosition = from;

    // --- Robustly find the position of the ~ symbol --- //
    let tildePosition = -1;
    // Search backwards from the cursor position
    const searchLimit = Math.max(0, currentPosition - 50); // Limit search to 50 chars back
    editor.state.doc.nodesBetween(searchLimit, currentPosition, (node, pos) => {
      if (tildePosition !== -1) return false; // Stop if already found

      if (node.isText) {
        const nodeText = node.textContent || '';
        let searchFromIndex = currentPosition - pos - 1; // Start searching from the relative cursor position within the node
        let relativeTildePos = nodeText.lastIndexOf('~', searchFromIndex);

        while (relativeTildePos !== -1) {
          const absoluteTildePos = pos + relativeTildePos;
          // Ensure the found ~ is within the search range and before the cursor
          if (absoluteTildePos >= searchLimit && absoluteTildePos < currentPosition) {
            // Check if there's a space or start of node right after the ~
            // (to ensure we found the start of the mention query)
            const textAfterTilde = editor.state.doc.textBetween(absoluteTildePos + 1, currentPosition, "");
            if (!textAfterTilde.match(/^\s/) && textAfterTilde.indexOf('~') === -1) { // Ensure no space and no other ~ between trigger and cursor
              tildePosition = absoluteTildePos;
              return false; // Stop searching
            }
          }
          // Continue searching backwards within the same text node
          searchFromIndex = relativeTildePos - 1;
          relativeTildePos = nodeText.lastIndexOf('~', searchFromIndex);
        }
      }
      return true; // Continue searching other nodes
    });
    // --- End of robust search --- //

    // Close suggestions immediately
    setShowEpicMentionSuggestions(false);

    // Proceed with deletion and insertion if ~ was found
    if (tildePosition !== -1) {
      // Delete from the found ~ position to the current cursor position
      editor.chain().focus().deleteRange({
        from: tildePosition,
        to: currentPosition
      }).run();

      // Insert the epic mention node where the ~ was
      editor.chain().insertContentAt(tildePosition, {
        type: 'epicMention',
        attrs: {
          id: epic.id,
          title: epic.title,
          issueKey: epic.issueKey,
        },
      }).run();

      // Add space after the inserted mention node
      editor.chain().insertContentAt(tildePosition + 1, ' ').focus().run(); // +1 because mention node itself has length 1

    } else {
      // Fallback: If no ~ was found, insert the epic mention at the current cursor position
      // This might happen if suggestion was triggered in an unusual way
      editor.chain().focus().insertContent({
        type: 'epicMention',
        attrs: {
          id: epic.id,
          title: epic.title,
          issueKey: epic.issueKey,
        },
      }).insertContent(' ').run();
    }
  }, [editor]);

  // Insert a story mention at cursor position
  const insertStoryMention = useCallback((story: Story) => {
    if (!editor) return;

    const { from } = editor.state.selection;
    const currentPosition = from;

    // --- Robustly find the position of the ^ symbol --- //
    let caretPosition = -1;
    // Search backwards from the cursor position
    const searchLimit = Math.max(0, currentPosition - 50); // Limit search to 50 chars back
    editor.state.doc.nodesBetween(searchLimit, currentPosition, (node, pos) => {
      if (caretPosition !== -1) return false; // Stop if already found

      if (node.isText) {
        const nodeText = node.textContent || '';
        let searchFromIndex = currentPosition - pos - 1; // Start searching from the relative cursor position within the node
        let relativeCaretPos = nodeText.lastIndexOf('^', searchFromIndex);

        while (relativeCaretPos !== -1) {
          const absoluteCaretPos = pos + relativeCaretPos;
          // Ensure the found ^ is within the search range and before the cursor
          if (absoluteCaretPos >= searchLimit && absoluteCaretPos < currentPosition) {
            // Check if there's a space or start of node right after the ^
            // (to ensure we found the start of the mention query)
            const textAfterCaret = editor.state.doc.textBetween(absoluteCaretPos + 1, currentPosition, "");
            if (!textAfterCaret.match(/^\s/) && textAfterCaret.indexOf('^') === -1) { // Ensure no space and no other ^ between trigger and cursor
              caretPosition = absoluteCaretPos;
              return false; // Stop searching
            }
          }
          // Continue searching backwards within the same text node
          searchFromIndex = relativeCaretPos - 1;
          relativeCaretPos = nodeText.lastIndexOf('^', searchFromIndex);
        }
      }
      return true; // Continue searching other nodes
    });
    // --- End of robust search --- //

    // Close suggestions immediately
    setShowStoryMentionSuggestions(false);

    // Proceed with deletion and insertion if ^ was found
    if (caretPosition !== -1) {
      // Delete from the found ^ position to the current cursor position
      editor.chain().focus().deleteRange({
        from: caretPosition,
        to: currentPosition
      }).run();

      // Insert the story mention node where the ^ was
      editor.chain().insertContentAt(caretPosition, {
        type: 'storyMention',
        attrs: {
          id: story.id,
          title: story.title,
          issueKey: story.issueKey,
        },
      }).run();

      // Add space after the inserted mention node
      editor.chain().insertContentAt(caretPosition + 1, ' ').focus().run(); // +1 because mention node itself has length 1

    } else {
      // Fallback: If no ^ was found, insert the story mention at the current cursor position
      // This might happen if suggestion was triggered in an unusual way
      editor.chain().focus().insertContent({
        type: 'storyMention',
        attrs: {
          id: story.id,
          title: story.title,
          issueKey: story.issueKey,
        },
      }).insertContent(' ').run();
    }
  }, [editor]);

  // Insert a milestone mention at cursor position
  const insertMilestoneMention = useCallback((milestone: Milestone) => {
    if (!editor) return;

    const { from } = editor.state.selection;
    const currentPosition = from;

    // --- Robustly find the position of the ! symbol --- //
    let exclamationPosition = -1;
    // Search backwards from the cursor position
    const searchLimit = Math.max(0, currentPosition - 50); // Limit search to 50 chars back
    editor.state.doc.nodesBetween(searchLimit, currentPosition, (node, pos) => {
      if (exclamationPosition !== -1) return false; // Stop if already found

      if (node.isText) {
        const nodeText = node.textContent || '';
        let searchFromIndex = currentPosition - pos - 1; // Start searching from the relative cursor position within the node
        let relativeExclamationPos = nodeText.lastIndexOf('!', searchFromIndex);

        while (relativeExclamationPos !== -1) {
          const absoluteExclamationPos = pos + relativeExclamationPos;
          // Ensure the found ! is within the search range and before the cursor
          if (absoluteExclamationPos >= searchLimit && absoluteExclamationPos < currentPosition) {
            // Check if there's a space or start of node right after the !
            // (to ensure we found the start of the mention query)
            const textAfterExclamation = editor.state.doc.textBetween(absoluteExclamationPos + 1, currentPosition, "");
            if (!textAfterExclamation.match(/^\s/) && textAfterExclamation.indexOf('!') === -1) { // Ensure no space and no other ! between trigger and cursor
              exclamationPosition = absoluteExclamationPos;
              return false; // Stop searching
            }
          }
          // Continue searching backwards within the same text node
          searchFromIndex = relativeExclamationPos - 1;
          relativeExclamationPos = nodeText.lastIndexOf('!', searchFromIndex);
        }
      }
      return true; // Continue searching other nodes
    });
    // --- End of robust search --- //

    // Close suggestions immediately
    setShowMilestoneMentionSuggestions(false);

    // Proceed with deletion and insertion if ! was found
    if (exclamationPosition !== -1) {
      // Delete from the found ! position to the current cursor position
      editor.chain().focus().deleteRange({
        from: exclamationPosition,
        to: currentPosition
      }).run();

      // Insert the milestone mention node where the ! was
      editor.chain().insertContentAt(exclamationPosition, {
        type: 'milestoneMention',
        attrs: {
          id: milestone.id,
          title: milestone.title,
          issueKey: milestone.issueKey,
        },
      }).run();

      // Add space after the inserted mention node
      editor.chain().insertContentAt(exclamationPosition + 1, ' ').focus().run(); // +1 because mention node itself has length 1

    } else {
      // Fallback: If no ! was found, insert the milestone mention at the current cursor position
      // This might happen if suggestion was triggered in an unusual way
      editor.chain().focus().insertContent({
        type: 'milestoneMention',
        attrs: {
          id: milestone.id,
          title: milestone.title,
          issueKey: milestone.issueKey,
        },
      }).insertContent(' ').run();
    }
  }, [editor]);

  // Handle command selection
  const handleCommandSelect = useCallback((command: CommandOption) => {
    if (!editor) return;
    
    const currentPosition = editor.view.state.selection.from;
    
    // Find and remove the slash trigger
    const content = editor.state.doc.textBetween(0, currentPosition, ' ', ' ');
    const lastSlashIndex = content.lastIndexOf('/');
    
    if (lastSlashIndex !== -1) {
      // Delete the slash and any text after it
      editor.chain().focus().deleteRange({
        from: lastSlashIndex,
        to: currentPosition
      }).run();
    }
    
    // Close command menu
    setShowCommandMenu(false);
    
    // Execute the command action
    switch (command.id) {
      case 'mention-user':
        // Insert @ to trigger user mention
        editor.chain().focus().insertContent('@').run();
        break;
      case 'mention-task':
        // Insert # to trigger task mention
        editor.chain().focus().insertContent('#').run();
        break;
      case 'mention-epic':
        // Insert ~ to trigger epic mention
        editor.chain().focus().insertContent('~').run();
        break;
      case 'mention-story':
        // Insert ^ to trigger story mention
        editor.chain().focus().insertContent('^').run();
        break;
      case 'mention-milestone':
        // Insert ! to trigger milestone mention
        editor.chain().focus().insertContent('!').run();
        break;
      default:
        break;
    }
  }, [editor]);
  
  // Check for @ mentions when typing
  const checkForMentionTrigger = useCallback(() => {
    if (!editor) return;
    
    // Skip checking if a mention was just inserted within the last 300ms
    const timeSinceLastMention = Date.now() - lastMentionInsertedRef.current;
    if (timeSinceLastMention < 300) {
      return;
    }
    
    const currentPosition = editor.view.state.selection.from;
    const content = editor.state.doc.textBetween(0, currentPosition, ' ', ' ');
    
    // Find the last @ character
    const lastAtIndex = content.lastIndexOf('@');
    
    if (lastAtIndex >= 0) {
      // Check if there's a space between the last @ and the word we're typing
      const textAfterAt = content.substring(lastAtIndex + 1);
      const hasSpaceAfterAt = textAfterAt.match(/^\s/);
      
      if (!hasSpaceAfterAt) {
        // Don't show suggestions if the query starts with a special character
        if (!textAfterAt.match(/^[^a-zA-Z0-9]/)) {
          // Position the suggestion popup
          const domPosition = editor.view.coordsAtPos(currentPosition);
          const editorContainer = editor.view.dom.getBoundingClientRect();
          
          // Set caret position for mention suggestions
          setCaretPosition({
            top: domPosition.bottom - editorContainer.top,
            left: domPosition.left - editorContainer.left,
          });
          
          // Set the query and show suggestions
          setMentionQuery(textAfterAt);
          setShowMentionSuggestions(true);
          return;
        }
      }
    }
    
    setShowMentionSuggestions(false);
  }, [editor]);

    // Check for # task mentions when typing  
  const checkForTaskMentionTrigger = useCallback(() => {
    if (!editor) return;
    
    const currentPosition = editor.view.state.selection.from;
    const content = editor.state.doc.textBetween(0, currentPosition, ' ', ' ');
    
    // Find the last # character
    const lastHashIndex = content.lastIndexOf('#');
    
    if (lastHashIndex >= 0) {
      // Check if there's a space between the last # and the word we're typing
      const textAfterHash = content.substring(lastHashIndex + 1);
      const hasSpaceAfterHash = textAfterHash.match(/^\s/);
      
      if (!hasSpaceAfterHash) {
        // Don't show suggestions if the query starts with a special character
        if (!textAfterHash.match(/^[^a-zA-Z0-9]/)) {
          // Position the suggestion popup
          const domPosition = editor.view.coordsAtPos(currentPosition);
          const editorContainer = editor.view.dom.getBoundingClientRect();
          
          // Set caret position for task mention suggestions
          setTaskCaretPosition({
            top: domPosition.bottom - editorContainer.top,
            left: domPosition.left - editorContainer.left,
          });
          
          // Set the query and show suggestions
          setTaskMentionQuery(textAfterHash);
          setShowTaskMentionSuggestions(true);
          return;
        }
      }
    }
    
    setShowTaskMentionSuggestions(false);
  }, [editor]);

    // Check for ~ epic mentions when typing  
  const checkForEpicMentionTrigger = useCallback(() => {
    if (!editor) return;
    
    const currentPosition = editor.view.state.selection.from;
    const content = editor.state.doc.textBetween(0, currentPosition, ' ', ' ');
    
    // Find the last ~ character
    const lastTildeIndex = content.lastIndexOf('~');
    
    if (lastTildeIndex >= 0) {
      // Check if there's a space between the last ~ and the word we're typing
      const textAfterTilde = content.substring(lastTildeIndex + 1);
      const hasSpaceAfterTilde = textAfterTilde.match(/^\s/);
      
      if (!hasSpaceAfterTilde) {
        // Don't show suggestions if the query starts with a special character
        if (!textAfterTilde.match(/^[^a-zA-Z0-9]/)) {
          // Position the suggestion popup
          const domPosition = editor.view.coordsAtPos(currentPosition);
          const editorContainer = editor.view.dom.getBoundingClientRect();
          
          // Set caret position for epic mention suggestions
          setEpicCaretPosition({
            top: domPosition.bottom - editorContainer.top,
            left: domPosition.left - editorContainer.left,
          });
          
          // Set the query and show suggestions
          setEpicMentionQuery(textAfterTilde);
          setShowEpicMentionSuggestions(true);
          return;
        }
      }
    }
    
    setShowEpicMentionSuggestions(false);
  }, [editor]);

    // Check for ^ story mentions when typing  
  const checkForStoryMentionTrigger = useCallback(() => {
    if (!editor) return;
    
    const currentPosition = editor.view.state.selection.from;
    const content = editor.state.doc.textBetween(0, currentPosition, ' ', ' ');
    
    // Find the last ^ character
    const lastCaretIndex = content.lastIndexOf('^');
    
    if (lastCaretIndex >= 0) {
      // Check if there's a space between the last ^ and the word we're typing
      const textAfterCaret = content.substring(lastCaretIndex + 1);
      const hasSpaceAfterCaret = textAfterCaret.match(/^\s/);
      
      if (!hasSpaceAfterCaret) {
        // Don't show suggestions if the query starts with a special character
        if (!textAfterCaret.match(/^[^a-zA-Z0-9]/)) {
          // Position the suggestion popup
          const domPosition = editor.view.coordsAtPos(currentPosition);
          const editorContainer = editor.view.dom.getBoundingClientRect();
          
          // Set caret position for story mention suggestions
          setStoryCaretPosition({
            top: domPosition.bottom - editorContainer.top,
            left: domPosition.left - editorContainer.left,
          });
          
          // Set the query and show suggestions
          setStoryMentionQuery(textAfterCaret);
          setShowStoryMentionSuggestions(true);
          return;
        }
      }
    }
    
    setShowStoryMentionSuggestions(false);
  }, [editor]);

    // Check for ! milestone mentions when typing  
  const checkForMilestoneMentionTrigger = useCallback(() => {
    if (!editor) return;
    
    const currentPosition = editor.view.state.selection.from;
    const content = editor.state.doc.textBetween(0, currentPosition, ' ', ' ');
    
    // Find the last ! character
    const lastExclamationIndex = content.lastIndexOf('!');
    

    
    if (lastExclamationIndex >= 0) {
      // Check if there's a space between the last ! and the word we're typing
      const textAfterExclamation = content.substring(lastExclamationIndex + 1);
      const hasSpaceAfterExclamation = textAfterExclamation.match(/^\s/);
      
      if (!hasSpaceAfterExclamation) {
        // Don't show suggestions if the query starts with a special character
        if (!textAfterExclamation.match(/^[^a-zA-Z0-9]/)) {
          // Position the suggestion popup
          const domPosition = editor.view.coordsAtPos(currentPosition);
          const editorContainer = editor.view.dom.getBoundingClientRect();
          
          // Set caret position for milestone mention suggestions
          setMilestoneCaretPosition({
            top: domPosition.bottom - editorContainer.top,
            left: domPosition.left - editorContainer.left,
          });
          
          // Set the query and show suggestions
          setMilestoneMentionQuery(textAfterExclamation);
          setShowMilestoneMentionSuggestions(true);
          return;
        }
      }
    }
    
    setShowMilestoneMentionSuggestions(false);
  }, [editor]);

  // Check for command trigger (/)
  const checkForCommandTrigger = useCallback(() => {
    if (!editor) return;
    
    const currentPosition = editor.view.state.selection.from;
    const content = editor.state.doc.textBetween(0, currentPosition, ' ', ' ');
    
    // Look for slash at the beginning of a line or after a space
    const lastSlashIndex = content.lastIndexOf('/');
    
    if (lastSlashIndex >= 0) {
      const textBeforeSlash = content.substring(0, lastSlashIndex);
      const textAfterSlash = content.substring(lastSlashIndex + 1);
      
      // Check if slash is at line start or after whitespace
      const isValidSlashPosition = lastSlashIndex === 0 || 
        textBeforeSlash.endsWith(' ') || 
        textBeforeSlash.endsWith('\n');
      
      // Check if there's no space after slash (still typing command)
      const hasSpaceAfterSlash = textAfterSlash.includes(' ') || textAfterSlash.includes('\n');
      
      if (isValidSlashPosition && !hasSpaceAfterSlash && textAfterSlash.length <= 20) {
        // Position the command menu
        const domPosition = editor.view.coordsAtPos(currentPosition);
        const editorContainer = editor.view.dom.getBoundingClientRect();
        
        setCommandMenuPosition({
          top: domPosition.bottom - editorContainer.top,
          left: domPosition.left - editorContainer.left,
        });
        
        setShowCommandMenu(true);
        return;
      }
    }
    
    setShowCommandMenu(false);
  }, [editor]);
  
  // Add mention event handlers
  useEffect(() => {
    if (!editor) return;
    
    // Update the editor
    editor.on('update', checkForMentionTrigger);
    editor.on('update', checkForTaskMentionTrigger);
    editor.on('update', checkForEpicMentionTrigger);
    editor.on('update', checkForStoryMentionTrigger);
    editor.on('update', checkForMilestoneMentionTrigger);
    editor.on('update', checkForCommandTrigger);
    
    return () => {
      editor.off('update', checkForMentionTrigger);
      editor.off('update', checkForTaskMentionTrigger);
      editor.off('update', checkForEpicMentionTrigger);
      editor.off('update', checkForStoryMentionTrigger);
      editor.off('update', checkForMilestoneMentionTrigger);
      editor.off('update', checkForCommandTrigger);
    };
  }, [editor, checkForMentionTrigger, checkForTaskMentionTrigger, checkForEpicMentionTrigger, checkForStoryMentionTrigger, checkForMilestoneMentionTrigger, checkForCommandTrigger]);

  // Handle keyboard events for command menu
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Let CommandMenu handle these keys when it's open
      if (showCommandMenu && ["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) {
        event.preventDefault();
        return;
      }
    };

    editor.view.dom.addEventListener('keydown', handleKeyDown);
    
    return () => {
      editor.view.dom.removeEventListener('keydown', handleKeyDown);
    };
  }, [editor, showCommandMenu]);
  
  // Close mention suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mentionSuggestionRef.current &&
        !mentionSuggestionRef.current.contains(event.target as HTMLElement) &&
        editor &&
        !editor.view.dom.contains(event.target as HTMLElement)
      ) {
        setShowMentionSuggestions(false);
      }
      
      if (
        taskMentionSuggestionRef.current &&
        !taskMentionSuggestionRef.current.contains(event.target as HTMLElement) &&
        editor &&
        !editor.view.dom.contains(event.target as HTMLElement)
      ) {
        setShowTaskMentionSuggestions(false);
      }
      
      if (
        epicMentionSuggestionRef.current &&
        !epicMentionSuggestionRef.current.contains(event.target as HTMLElement) &&
        editor &&
        !editor.view.dom.contains(event.target as HTMLElement)
      ) {
        setShowEpicMentionSuggestions(false);
      }
      
      if (
        storyMentionSuggestionRef.current &&
        !storyMentionSuggestionRef.current.contains(event.target as HTMLElement) &&
        editor &&
        !editor.view.dom.contains(event.target as HTMLElement)
      ) {
        setShowStoryMentionSuggestions(false);
      }
      
      if (
        milestoneMentionSuggestionRef.current &&
        !milestoneMentionSuggestionRef.current.contains(event.target as HTMLElement) &&
        editor &&
        !editor.view.dom.contains(event.target as HTMLElement)
      ) {
        setShowMilestoneMentionSuggestions(false);
      }
      
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(event.target as HTMLElement) &&
        editor &&
        !editor.view.dom.contains(event.target as HTMLElement)
      ) {
        setShowCommandMenu(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [editor]);

  // Add this CSS to make mentions visually distinct
  useEffect(() => {
    // Add CSS for mentions
    const style = document.createElement('style');
    style.textContent = `
      .ProseMirror .mention {
        background-color: hsl(var(--primary) / 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: hsl(var(--primary));
        font-weight: 500;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        user-select: all;
        cursor: pointer;
      }
      
      .ProseMirror .task-mention {
        background-color: rgba(59, 130, 246, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #3b82f6;
        font-weight: 500;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        user-select: all;
        cursor: pointer;
      }
      
      .ProseMirror .epic-mention {
        background-color: rgba(168, 85, 247, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #a855f7;
        font-weight: 500;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        user-select: all;
        cursor: pointer;
      }
      
      .ProseMirror .story-mention {
        background-color: rgba(34, 197, 94, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #22c55e;
        font-weight: 500;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        user-select: all;
        cursor: pointer;
      }
      
      .ProseMirror .milestone-mention {
        background-color: rgba(245, 158, 11, 0.1);
        border-radius: 0.25rem;
        padding: 0.125rem 0.25rem;
        margin: 0 0.125rem;
        color: #f59e0b;
        font-weight: 500;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        user-select: all;
        cursor: pointer;
      }
      
      .ProseMirror .mention .mention-symbol,
      .ProseMirror .task-mention .mention-symbol,
      .ProseMirror .epic-mention .mention-symbol,
      .ProseMirror .story-mention .mention-symbol,
      .ProseMirror .milestone-mention .mention-symbol {
        opacity: 0.7;
        margin-right: 1px;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

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
                      disabled={isUploadingImage}
                    >
                      {isUploadingImage ? (
                        <Loader2 size={iconSize} className="animate-spin" />
                      ) : (
                        <ImageIcon size={iconSize} />
                      )}
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isUploadingImage ? "Uploading image..." : "Image (paste or drop)"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent className="w-80 p-3">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-medium flex items-center gap-2 mb-1">
                  <ImageIcon size={16} className="text-primary" />
                  <span>Insert Image</span>
                </div>
                <div className="text-xs text-muted-foreground mb-3 bg-muted/40 p-2 rounded-md flex items-start gap-2">
                  <span className="text-primary mt-0.5">💡</span>
                  <span>Paste with Ctrl+V, drop an image, or enter URL below</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={addImage} disabled={!imageUrl} className="shrink-0">Add</Button>
                </div>
                <div className="text-xs text-muted-foreground mt-3 border-t pt-3 border-border/50">
                  <p className="mb-2 font-medium text-foreground/80">Image Features:</p>
                  <ul className="grid grid-cols-1 gap-1.5">
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                      <span>Resize by dragging any corner handle</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                      <span>Click image to view full size</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"></span>
                      <span>Hold Shift to change proportions</span>
                    </li>
                  </ul>
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

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={buttonSize}
                onClick={() => {
                  if (editor) {
                    // Focus the editor first
                    editor.commands.focus();
                    
                    // Insert the @ character
                    editor.commands.insertContent('@');
                    
                    // Reset the last mention insertion time so suggestion shows
                    lastMentionInsertedRef.current = 0;
                    
                    // Allow a small delay for the DOM to update
                    setTimeout(() => {
                      checkForMentionTrigger();
                    }, 50);
                  }
                }}
              >
                <AtSign size={iconSize} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Mention User</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex-1 relative" ref={editorContainerRef}>
        <EditorContent editor={editor} className="w-full" />
        
        {/* Overlay when uploading */}
        {isUploadingImage && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background border shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Uploading image...</span>
            </div>
          </div>
        )}
        
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

        {/* Mention suggestions */}
        {showMentionSuggestions && (
          <div 
            style={{ 
              position: "absolute",
              top: `${caretPosition.top}px`,
              left: `${caretPosition.left}px`,
              zIndex: 999999,
            }}
            className="transition-all duration-200 animate-in slide-in-from-left-1"
          >
            <MentionSuggestion
              query={mentionQuery}
              onSelect={insertMention}
              workspaceId={currentWorkspace?.id}
              onEscape={() => setShowMentionSuggestions(false)}
            />
          </div>
        )}

        {/* Task Mention Suggestions */}
        {showTaskMentionSuggestions && (
          <div 
            ref={taskMentionSuggestionRef}
            style={{ 
              position: "absolute",
              top: `${taskCaretPosition.top}px`,
              left: `${taskCaretPosition.left}px`,
              zIndex: 999999,
            }}
            className="transition-all duration-200 animate-in slide-in-from-left-1"
          >
            <TaskMentionSuggestion
              query={taskMentionQuery}
              onSelect={insertTaskMention}
              workspaceId={currentWorkspace?.id}
              onEscape={() => setShowTaskMentionSuggestions(false)}
            />
          </div>
        )}

        {/* Epic Mention Suggestions */}
        {showEpicMentionSuggestions && (
          <div 
            ref={epicMentionSuggestionRef}
            style={{ 
              position: "absolute",
              top: `${epicCaretPosition.top}px`,
              left: `${epicCaretPosition.left}px`,
              zIndex: 999999,
            }}
            className="transition-all duration-200 animate-in slide-in-from-left-1"
          >
            <EpicMentionSuggestion
              query={epicMentionQuery}
              onSelect={insertEpicMention}
              workspaceId={currentWorkspace?.id}
              onEscape={() => setShowEpicMentionSuggestions(false)}
            />
          </div>
        )}

        {/* Story Mention Suggestions */}
        {showStoryMentionSuggestions && (
          <div 
            ref={storyMentionSuggestionRef}
            style={{ 
              position: "absolute",
              top: `${storyCaretPosition.top}px`,
              left: `${storyCaretPosition.left}px`,
              zIndex: 999999,
            }}
            className="transition-all duration-200 animate-in slide-in-from-left-1"
          >
            <StoryMentionSuggestion
              query={storyMentionQuery}
              onSelect={insertStoryMention}
              workspaceId={currentWorkspace?.id}
              onEscape={() => setShowStoryMentionSuggestions(false)}
            />
          </div>
        )}

        {/* Milestone Mention Suggestions */}
        {showMilestoneMentionSuggestions && (
          <div 
            ref={milestoneMentionSuggestionRef}
            style={{ 
              position: "absolute",
              top: `${milestoneCaretPosition.top}px`,
              left: `${milestoneCaretPosition.left}px`,
              zIndex: 999999,
            }}
            className="transition-all duration-200 animate-in slide-in-from-left-1"
          >
            <MilestoneMentionSuggestion
              query={milestoneMentionQuery}
              onSelect={insertMilestoneMention}
              workspaceId={currentWorkspace?.id}
              onEscape={() => setShowMilestoneMentionSuggestions(false)}
            />
          </div>
        )}

        {/* Command Menu */}
        {showCommandMenu && (
          <div 
            ref={commandMenuRef}
            style={{ 
              position: "absolute",
              top: `${commandMenuPosition.top}px`,
              left: `${commandMenuPosition.left}px`,
              zIndex: 999999,
            }}
            className="transition-all duration-200 animate-in slide-in-from-left-1"
          >
            <CommandMenu
              onSelect={handleCommandSelect}
              onEscape={() => setShowCommandMenu(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
} 