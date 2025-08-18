import { Extension } from '@tiptap/core';

export interface SaveDiscardOptions {
  onContentChange?: (content: string, hasChanges: boolean) => void;
  onSave?: () => void;
  onDiscard?: () => void;
  originalContent?: string;
}

export const SaveDiscardExtension = Extension.create<SaveDiscardOptions>({
  name: 'saveDiscard',

  addOptions() {
    return {
      onContentChange: undefined,
      onSave: undefined,
      onDiscard: undefined,
      originalContent: '',
    };
  },

  addCommands() {
    return {
      save: () => () => {
        this.options.onSave?.();
        return true;
      },
      discard: () => ({ editor }) => {
        if (this.options.originalContent !== undefined) {
          editor.commands.setContent(this.options.originalContent);
        }
        this.options.onDiscard?.();
        return true;
      },
      updateOriginalContent: (content: string) => () => {
        this.options.originalContent = content;
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-s': () => {
        this.options.onSave?.();
        return true;
      },
      'Escape': () => {
        // Could trigger discard if there are unsaved changes
        // But we'll let the parent component handle this
        return false;
      },
    };
  },

  onCreate() {
    // Set up content change detection
    this.editor.on('update', ({ editor }) => {
      const currentContent = editor.getHTML();
      const hasChanges = currentContent !== (this.options.originalContent || '');
      this.options.onContentChange?.(currentContent, hasChanges);
    });
  },

  onDestroy() {
    // Clean up event listeners if needed
  },
});
