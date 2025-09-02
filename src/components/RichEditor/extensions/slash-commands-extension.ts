import { Editor, Extension, RawCommands } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: any; // React component
  command: (editor: any) => void;
}

export interface SlashCommandsOptions {
  commands: SlashCommand[];
  onShowMenu?: (position: { top: number; left: number }, query: string, commands: SlashCommand[]) => void;
  onHideMenu?: () => void;
  onSelectCommand?: (index: number) => void;
  isMenuOpen?: () => boolean;
}

export const SlashCommandsExtension = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      commands: [],
      onShowMenu: undefined,
      onHideMenu: undefined,
      onSelectCommand: undefined,
      isMenuOpen: undefined,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('slashCommands'),
        
        props: {
          handleKeyDown: (view, event) => {
            const { state } = view;
            const { selection } = state;
            
            // If menu is open, let React component handle ALL keys
            const isMenuOpen = this.options.isMenuOpen?.();
            if (isMenuOpen) {
              return false; // Let React handle everything when menu is open
            }
            
            // Handle slash key only when menu is not open
            if (event.key === '/') {
              const { from } = selection;
              const beforeText = state.doc.textBetween(Math.max(0, from - 10), from, ' ', ' ');
              
              if (beforeText.trim() === '' || beforeText.endsWith(' ')) {
                setTimeout(() => {
                  const coords = view.coordsAtPos(from);
                  const editorRect = view.dom.getBoundingClientRect();
                  
                  this.options.onShowMenu?.({
                    top: coords.bottom - editorRect.top + 5,
                    left: coords.left - editorRect.left,
                  }, '', this.options.commands);
                }, 0);
              }
            }

            // Let React component handle all other keys
            return false;
          },
        },

        view: () => ({
          update: (view, prevState) => {
            // Handle query updates when slash menu is open
            // This will be managed by the parent component
          },
        }),
      }),
    ];
  },

  addCommands() {
    return {
      executeSlashCommand: (command: SlashCommand) => ({ editor, tr, dispatch }: { editor: Editor; tr: any; dispatch: any }) => {
        // Hide the menu first
        this.options.onHideMenu?.();
        
        // Get current selection position
        const { from } = tr.selection;
        const beforeText = tr.doc.textBetween(Math.max(0, from - 50), from, ' ', ' ');
        const slashIndex = beforeText.lastIndexOf('/');
        
        // Remove the slash and query text in the same transaction
        if (slashIndex !== -1) {
          const deleteFrom = from - (beforeText.length - slashIndex);
          tr.delete(deleteFrom, from);
        }
        
        // Dispatch the transaction with the deletion
        if (dispatch) {
          dispatch(tr);
        }
        
        // Execute the actual command after a brief delay to ensure the deletion transaction is applied
        setTimeout(() => {
          command.command(editor);
        }, 0);
        
        return true;
      },
    } as any;
  },
});
