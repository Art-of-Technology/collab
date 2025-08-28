import { Extension } from '@tiptap/core';
import { extractSelectionAsMarkdown } from '../utils/ai-improve';

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
            console.log('AIImproveExtension: No selection or no callback, returning false');
            return false;
          }

          // Extract both plain text and markdown for comparison
          const selectedText = editor.state.doc.textBetween(from, to, ' ');
          
          // Extract markdown-formatted content
          const selectedMarkdown = extractSelectionAsMarkdown(editor, from, to);
          
          if (!selectedText.trim()) {
            console.log('AIImproveExtension: No text selected, returning false');
            return false;
          }

          // Use markdown if it's different from plain text (has formatting), otherwise use plain text
          const contentToImprove = selectedMarkdown && selectedMarkdown !== selectedText ? selectedMarkdown : selectedText;
   
          // Save the selection position and original text
          this.storage.savedSelection = { from, to, originalText: selectedText };
          this.storage.isImproving = true;

          // Call the AI improve function with the formatted content
          this.options.onAiImprove(contentToImprove)
            .then((result) => {
              console.log('AIImproveExtension: AI improve result received:', result);
              this.storage.improvedText = result;
              this.storage.showImprovePopover = true;
              this.storage.isImproving = false;
              
              // Emit a custom event to notify the UI
              console.log('AIImproveExtension: Dispatching ai-improve-ready event');
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
