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

/**
 * Optimized keyboard event handler for mention triggers
 * Handles immediate SPACE termination to prevent infinite loops
 */
export function handleMentionKeyEvents(
  event: KeyboardEvent,
  onCheckMentions: () => void
): boolean {
  // Handle @ for mentions - # is handled separately below
  if (event.key === '@') {
    onCheckMentions();
    return false; // Allow @ to be typed
  }

  // Handle space key - IMMEDIATELY stop ALL mention processing
  if (event.key === ' ') {
    const editor = (event.target as any)?.editor;
    if (editor) {
      // Immediately close any open mention suggestions/popovers
      const mentionPopovers = editor.view.dom.querySelectorAll('[data-mention-suggestion], .mention-suggestion, .floating-menu');
      mentionPopovers.forEach(popover => {
        if (popover.parentNode) {
          popover.parentNode.removeChild(popover);
        }
      });

      // Dispatch custom event to close any active mention suggestions across all components
      const closeMentionEvent = new CustomEvent('close-mention-suggestions', {
        bubbles: true,
        cancelable: true
      });
      editor.view.dom.dispatchEvent(closeMentionEvent);

      // Check if this is markdown header syntax (e.g., "# ", "## ", "### ")
      const { from } = editor.state.selection;
      const textBeforeCursor = editor.state.doc.textBetween(Math.max(0, from - 6), from, "");

      // If we see markdown header patterns, don't process as mentions
      if (textBeforeCursor.match(/#{1,6}\s*$/)) {
        return false;
      }
    }

    // Always return false to prevent any mention processing when space is pressed
    return false;
  }

  // Handle consecutive hash keys to prevent markdown confusion
  if (event.key === '#') {
    const editor = (event.target as any)?.editor;
    if (editor) {
      const { from } = editor.state.selection;
      const textBeforeCursor = editor.state.doc.textBetween(Math.max(0, from - 6), from, "");

      // If we see multiple consecutive # characters, it's likely markdown - prevent typing
      if (textBeforeCursor.match(/#{2,6}$/)) {
        return false;
      }
    }

    // For single #, allow typing but still check for mentions
    onCheckMentions();
    return false;
  }

  // For other printable characters, only check mentions if we're likely in a mention context
  // This reduces unnecessary checks while still catching most cases
  if (event.key.length === 1) {
    // Only check for mentions on characters that could be part of a mention query
    const mentionQueryChars = /^[a-zA-Z0-9_-]$/;
    if (mentionQueryChars.test(event.key)) {
      onCheckMentions();
      return true;
    }
  }

  // Handle backspace and delete - check for mentions to handle edge cases
  if (event.key === 'Backspace' || event.key === 'Delete') {
    onCheckMentions();
    return true;
  }

  return false;
}
