import { Extension } from '@tiptap/core';

// CSS for resizable images
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
  transform: scale(1.1);
}
.resize-handle:active {
  background-color: hsl(var(--primary));
  transform: scale(1.2);
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
export const ImageCSSExtension = Extension.create({
  name: 'imageCSSExtension',
  
  addOptions() {
    return {
      css: imageCSS,
    };
  },
  
  onCreate() {
    // Create and add style element
    const style = document.createElement('style');
    style.setAttribute('data-tiptap-resizable-image-css', '');
    style.textContent = this.options.css;
    document.head.appendChild(style);
  },
  
  onDestroy() {
    // Remove style element when extension is destroyed
    const style = document.querySelector('[data-tiptap-resizable-image-css]');
    if (style) {
      style.remove();
    }
  },
});
