import { Node } from '@tiptap/core';
import { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableVideo: {
      setVideo: (options: { src: string; width?: number; height?: number }) => ReturnType;
    };
  }
}

export const ResizableVideoExtension = Node.create({
  name: 'resizableVideo',
  
  group: 'block',
  
  draggable: true,
  
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => {
          if (!attributes.src) {
            return {};
          }
          return { src: attributes.src };
        },
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width');
          return width ? parseInt(width) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {};
          }
          return { width: String(attributes.width) };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute('height');
          return height ? parseInt(height) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.height) {
            return {};
          }
          return { height: String(attributes.height) };
        },
      },
      controls: {
        default: true,
        parseHTML: (element) => element.hasAttribute('controls'),
        renderHTML: (attributes) => {
          if (attributes.controls) {
            return { controls: 'controls' };
          }
          return {};
        },
      },
      // Keep track of the original video dimensions
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

  parseHTML() {
    return [
      {
        tag: 'video',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['video', HTMLAttributes];
  },

  addNodeView() {
    return ((props: NodeViewRendererProps) => {
      const { node, editor, getPos } = props;
      const { src, width, height, controls } = node.attrs;
      
      // Create the container element
      const container = document.createElement('div');
      container.classList.add('video-resizable-container');
      container.style.position = 'relative';
      container.style.display = 'inline-block';
      container.style.lineHeight = '0';
      container.style.maxWidth = '100%';
      container.style.margin = '1rem 0';
      
      // Create the video element
      const video = document.createElement('video');
      video.src = src;
      video.controls = controls !== false;
      video.classList.add('resizable-video');
      video.style.display = 'block';
      video.style.cursor = 'default';
      
      // Set initial dimensions if provided
      if (width) {
        video.width = width;
      }
      if (height) {
        video.height = height;
      }
      
      // Store original dimensions when video metadata is loaded
      video.addEventListener('loadedmetadata', () => {
        if (!node.attrs.originalWidth || !node.attrs.originalHeight) {
          const originalWidth = video.videoWidth;
          const originalHeight = video.videoHeight;
          
          if (typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.commands.command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { 
                  ...node.attrs, 
                  originalWidth,
                  originalHeight,
                  // Set initial width to video's natural width or 640px if larger
                  width: width || Math.min(originalWidth, 640),
                  height: height || Math.min(originalHeight, (640 / originalWidth) * originalHeight),
                });
                return true;
              });
            }
          }
        }
      });

      // Add delete button
      const deleteButton = document.createElement('button');
      deleteButton.className = 'video-delete-button';
      deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
      deleteButton.style.position = 'absolute';
      deleteButton.style.top = '4px';
      deleteButton.style.right = '4px';
      deleteButton.style.width = '28px';
      deleteButton.style.height = '28px';
      deleteButton.style.display = 'none';
      deleteButton.style.alignItems = 'center';
      deleteButton.style.justifyContent = 'center';
      deleteButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      deleteButton.style.color = '#ef4444';
      deleteButton.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      deleteButton.style.borderRadius = '4px';
      deleteButton.style.cursor = 'pointer';
      deleteButton.style.zIndex = '100';
      deleteButton.style.transition = 'all 0.2s ease';
      deleteButton.style.padding = '0';
      
      deleteButton.addEventListener('mouseenter', () => {
        deleteButton.style.backgroundColor = '#ef4444';
        deleteButton.style.color = 'white';
        deleteButton.style.transform = 'scale(1.05)';
      });
      
      deleteButton.addEventListener('mouseleave', () => {
        deleteButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        deleteButton.style.color = '#ef4444';
        deleteButton.style.transform = 'scale(1)';
      });
      
      deleteButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === 'function') {
          const pos = getPos();
          if (typeof pos === 'number') {
            editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
          }
        }
      });
      
      container.appendChild(deleteButton);

      // Make video resizable
      let isResizing = false;
      let startX = 0;
      let startY = 0;
      let startWidth = 0;
      let startHeight = 0;

      // Create resize handles (8 handles: corners + edges)
      const handles = ['se', 'sw', 'ne', 'nw', 'n', 's', 'e', 'w'];
      handles.forEach(handlePos => {
        const handle = document.createElement('div');
        handle.classList.add('resize-handle', `handle-${handlePos}`);
        handle.style.position = 'absolute';
        handle.style.width = '10px';
        handle.style.height = '10px';
        handle.style.backgroundColor = 'hsl(var(--background))';
        handle.style.border = '1px solid hsl(var(--foreground))';
        handle.style.borderRadius = '2px';
        handle.style.zIndex = '10';
        handle.style.display = 'none'; // Hidden by default
        
        // Position the handle based on its position code
        switch(handlePos) {
          case 'se': // bottom-right
            handle.style.bottom = '-8px';
            handle.style.right = '-4px';
            handle.style.cursor = 'nwse-resize';
            break;
          case 'sw': // bottom-left
            handle.style.bottom = '-8px'; 
            handle.style.left = '-4px';
            handle.style.cursor = 'nesw-resize';
            break;
          case 'ne': // top-right
            handle.style.top = '8px';
            handle.style.right = '-4px';
            handle.style.cursor = 'nesw-resize';
            break;
          case 'nw': // top-left
            handle.style.top = '8px';
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
            handle.style.right = '0';
            handle.style.transform = 'translateY(-50%)';
            handle.style.cursor = 'ew-resize';
            break;
          case 'w': // middle-left
            handle.style.top = '50%';
            handle.style.left = '-8px';   
            handle.style.transform = 'translateY(-50%)';
            handle.style.cursor = 'ew-resize';
            break;
        }
        
        // Add resize functionality
        handle.addEventListener('mousedown', (e: MouseEvent) => {
          if (!editor.isEditable) return;
          
          isResizing = true;
          startX = e.clientX;
          startY = e.clientY;
          startWidth = video.width || video.videoWidth || 640;
          startHeight = video.height || video.videoHeight || 360;
          
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
          newWidth = Math.max(100, newWidth);  // min width 100px
          newHeight = Math.max(56, newHeight); // min height 56px (16:9 aspect ratio at min width)
          
          // Update video dimensions
          video.width = Math.round(newWidth);
          video.height = Math.round(newHeight);
          
          // Update the node attributes for persistence
          if (typeof getPos === 'function') {
            const pos = getPos();
            if (typeof pos === 'number') {
              editor.commands.command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { 
                  ...node.attrs, 
                  width: Math.round(newWidth),
                  height: Math.round(newHeight),
                });
                return true;
              });
            }
          }
        };
        
        const stopResize = () => {
          isResizing = false;
          document.removeEventListener('mousemove', handleResize);
          document.removeEventListener('mouseup', stopResize);
        };
        
        container.appendChild(handle);
      });

      // Show handles and delete button on hover, hide on mouseout
      container.addEventListener('mouseenter', () => {
        if (!editor.isEditable) return;
        if (!isResizing) {
          container.querySelectorAll('.resize-handle').forEach(handle => {
            (handle as HTMLElement).style.display = 'block';
          });
          deleteButton.style.display = 'flex';
        }
      });
      
      container.addEventListener('mouseleave', () => {
        if (!isResizing) {
          container.querySelectorAll('.resize-handle').forEach(handle => {
            (handle as HTMLElement).style.display = 'none';
          });
          deleteButton.style.display = 'none';
        }
      });

      // Add video to container
      container.appendChild(video);

      return {
        dom: container,
        contentDOM: null,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'resizableVideo') {
            return false;
          }
          
          // Update only if src has changed
          if (updatedNode.attrs.src !== video.src) {
            video.src = updatedNode.attrs.src;
          }
          if (updatedNode.attrs.width) video.width = updatedNode.attrs.width;
          if (updatedNode.attrs.height) video.height = updatedNode.attrs.height;
          
          return true;
        },
        destroy: () => {
          // Clean up event listeners
          video.onloadedmetadata = null;
        },
      };
    }) as NodeViewRenderer;
  },

  addCommands() {
    return {
      setVideo: 
        (options: { src: string; width?: number; height?: number }) => 
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

