import { Editor } from '@tiptap/react';

export function getCaretPosition(editor: Editor, position: number) {
  try {
    const coords = editor.view.coordsAtPos(position);
    const editorRect = editor.view.dom.getBoundingClientRect();
    const scrollContainer = editor.view.dom.closest('.overflow-y-auto');
    let scrollTop = 0;
    
    if (scrollContainer) {
      scrollTop = scrollContainer.scrollTop;
    }
    
    return {
      top: coords.top - editorRect.top - scrollTop - 5, // Position at cursor line level
      left: coords.right - editorRect.left + 20, // Position to the right of cursor with 20px spacing
    };
  } catch (error) {
    // Fallback if position is invalid
    console.warn('Invalid cursor position:', position);
    return { top: 30, left: 100 };
  }
}

export function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

export function insertTextAtCursor(editor: Editor, text: string) {
  editor.chain().focus().insertContent(text).run();
}

export function replaceSelection(editor: Editor, content: string) {
  editor.chain().focus().deleteSelection().insertContent(content).run();
}
