import Image from '@tiptap/extension-image';
import { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/react';

export const ResizableImageExtension = Image.extend({
  name: 'resizableImage',

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
      
      // Add delete button
      const deleteButton = document.createElement('button');
      deleteButton.className = 'image-delete-button';
      deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
      deleteButton.style.position = 'absolute';
      deleteButton.style.top = '4px';
      deleteButton.style.right = '4px';
      deleteButton.style.width = '28px';
      deleteButton.style.height = '28px';
      deleteButton.style.display = 'none';
      deleteButton.style.alignItems = 'center';
      deleteButton.style.justifyContent = 'center';
      deleteButton.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
      deleteButton.style.color = 'rgba(239, 68, 68, 1)';
      deleteButton.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      deleteButton.style.borderRadius = '4px';
      deleteButton.style.cursor = 'pointer';
      deleteButton.style.zIndex = '100';
      deleteButton.style.transition = 'all 0.2s ease';
      deleteButton.style.padding = '0';
      
      deleteButton.addEventListener('mouseenter', () => {
        deleteButton.style.backgroundColor = 'rgba(239, 68, 68, 1)';
        deleteButton.style.color = 'white';
        deleteButton.style.transform = 'scale(1.05)';
      });
      
      deleteButton.addEventListener('mouseleave', () => {
        deleteButton.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
        deleteButton.style.color = 'rgba(239, 68, 68, 1)';
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
        handle.style.border = '1px solid hsl(var(--foreground))';
        handle.style.zIndex = '2';
        
        // Position the handle based on its position code
        switch(handlePos) {
          case 'se': // bottom-right
            handle.style.bottom = '0';
            handle.style.right = '-2px';
            handle.style.cursor = 'nwse-resize';
            break;
          case 'sw': // bottom-left
            handle.style.bottom = '0';
            handle.style.left = '-2px';
            handle.style.cursor = 'nesw-resize';
            break;
          case 'ne': // top-right
            handle.style.top = '0';
            handle.style.right = '-2px';
            handle.style.cursor = 'nesw-resize';
            break;
          case 'nw': // top-left
            handle.style.top = '0';
            handle.style.left = '-2px';
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
      
      // Show handles and delete button on hover, hide on mouseout
      container.addEventListener('mouseenter', () => {
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
