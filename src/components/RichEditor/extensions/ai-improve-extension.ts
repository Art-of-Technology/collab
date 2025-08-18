import { Extension } from '@tiptap/core';

export interface AIImproveOptions {
  onAiImprove?: (text: string) => Promise<string>;
  showAiImprove?: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiImprove: {
      /**
       * Improve selected text with AI
       */
      improveSelection: () => ReturnType;
    };
  }
}

export const AIImproveExtension = Extension.create<AIImproveOptions>({
  name: 'aiImprove',

  addOptions() {
    return {
      onAiImprove: undefined,
      showAiImprove: false,
    };
  },

  addStorage() {
    return {
      isImproving: false,
      improvedText: null,
      savedSelection: null,
      showImprovePopover: false,
    };
  },

  addCommands() {
    return {
      improveSelection:
        () =>
        ({ editor, commands }) => {
          const { from, to, empty } = editor.state.selection;
          
          // Only work with selected text
          if (empty || !this.options.onAiImprove) {
            return false;
          }

          const selectedText = editor.state.doc.textBetween(from, to, ' ');
          if (!selectedText.trim()) {
            return false;
          }

          // Save the selection position
          this.storage.savedSelection = { from, to };
          this.storage.isImproving = true;

          // Call the AI improve function
          this.options.onAiImprove(selectedText)
            .then((result) => {
              this.storage.improvedText = result;
              this.storage.showImprovePopover = true;
              this.storage.isImproving = false;
              
              // Emit a custom event to notify the UI
              editor.view.dom.dispatchEvent(
                new CustomEvent('ai-improve-ready', {
                  detail: {
                    improvedText: result,
                    savedSelection: this.storage.savedSelection,
                  },
                })
              );
            })
            .catch((error) => {
              console.error('Error improving text:', error);
              this.storage.isImproving = false;
              
              // Emit error event
              editor.view.dom.dispatchEvent(
                new CustomEvent('ai-improve-error', {
                  detail: { error },
                })
              );
            });

          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Cmd/Ctrl + Shift + I for AI improve
      'Mod-Shift-i': () => this.editor.commands.improveSelection(),
    };
  },

  onDestroy() {
    // Clean up storage when extension is destroyed
    this.storage.isImproving = false;
    this.storage.improvedText = null;
    this.storage.savedSelection = null;
    this.storage.showImprovePopover = false;
  },
});
