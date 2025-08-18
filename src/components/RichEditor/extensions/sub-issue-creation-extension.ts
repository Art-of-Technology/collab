import { Extension } from '@tiptap/core';

export interface SubIssueCreationOptions {
  onCreateSubIssue?: (selectedText: string) => void;
}

export const SubIssueCreationExtension = Extension.create<SubIssueCreationOptions>({
  name: 'subIssueCreation',

  addOptions() {
    return {
      onCreateSubIssue: undefined,
    };
  },

  addCommands() {
    return {
      createSubIssueFromSelection: () => ({ editor }) => {
        const { from, to, empty } = editor.state.selection;
        
        if (empty) return false;
        
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        
        if (selectedText.trim() && this.options.onCreateSubIssue) {
          this.options.onCreateSubIssue(selectedText.trim());
          return true;
        }
        
        return false;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Could add a keyboard shortcut if needed
      // 'Mod-Shift-s': () => this.editor.commands.createSubIssueFromSelection(),
    };
  },
});
