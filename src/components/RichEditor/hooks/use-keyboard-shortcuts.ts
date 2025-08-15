import { useEffect } from 'react';
import { Editor } from '@tiptap/react';

interface KeyboardShortcutsProps {
  editor: Editor | null;
  onSave?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts({ editor, onSave, onEscape }: KeyboardShortcutsProps) {
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Save shortcut (Ctrl/Cmd + S)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        onSave?.();
        return;
      }

      // Escape key
      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }
    };

    // Attach to editor's DOM element for better scoping
    const editorElement = editor.view.dom;
    editorElement.addEventListener('keydown', handleKeyDown);

    return () => {
      editorElement.removeEventListener('keydown', handleKeyDown);
    };
  }, [editor, onSave, onEscape]);
}
