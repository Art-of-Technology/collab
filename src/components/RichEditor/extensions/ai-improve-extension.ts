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
          if (empty) {
            console.log('AIImproveExtension: No selection, returning false');
            return false;
          }
          
          if (!this.options.onAiImprove) {
            console.log('AIImproveExtension: No callback provided, returning false');
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

          try {
            const improvePromise = this.options.onAiImprove(contentToImprove);
            
            if (!improvePromise || typeof improvePromise.then !== 'function') {
              this.storage.isImproving = false;
              editor.view.dom.dispatchEvent(
                new CustomEvent('ai-improve-error', {
                  detail: { error: new Error('onAiImprove did not return a promise') },
                })
              );
              return false;
            }
            
            improvePromise
              .then((result) => {
                if (!result || typeof result !== 'string') {
                  this.storage.isImproving = false;
                  editor.view.dom.dispatchEvent(
                    new CustomEvent('ai-improve-error', {
                      detail: { error: new Error('Invalid result received from AI improve') },
                    })
                  );
                  return;
                }
                
                this.storage.improvedText = result;
                this.storage.showImprovePopover = true;
                this.storage.isImproving = false;
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
                this.storage.isImproving = false;
                
                editor.view.dom.dispatchEvent(
                  new CustomEvent('ai-improve-error', {
                    detail: { error },
                  })
                );
              });
          } catch (error) {
            this.storage.isImproving = false;
            editor.view.dom.dispatchEvent(
              new CustomEvent('ai-improve-error', {
                detail: { error },
              })
            );
            return false;
          }

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
