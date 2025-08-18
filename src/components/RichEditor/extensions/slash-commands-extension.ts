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
}

export const SlashCommandsExtension = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      commands: [],
      onShowMenu: undefined,
      onHideMenu: undefined,
      onSelectCommand: undefined,
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
            
            // Handle slash key
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

            // Handle escape
            if (event.key === 'Escape') {
              this.options.onHideMenu?.();
              return true;
            }

            // Handle arrow keys and enter will be managed by the UI component
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
      executeSlashCommand: (command: SlashCommand) => ({ editor, tr }: { editor: Editor; tr: any }) => {
        // Get current selection position
        const { from } = tr.selection;
        const beforeText = tr.doc.textBetween(Math.max(0, from - 20), from, ' ', ' ');
        const slashIndex = beforeText.lastIndexOf('/');
        
        // Calculate the range to delete (slash + query)
        let deleteFrom = from;
        let deleteTo = from;
        
        if (slashIndex !== -1) {
          deleteFrom = from - (beforeText.length - slashIndex);
          deleteTo = from;
        }
        
        // Remove the slash and query text in the same transaction
        if (deleteFrom < deleteTo) {
          tr.delete(deleteFrom, deleteTo);
        }
        
        // Hide the menu
        this.options.onHideMenu?.();
        
        // Execute the actual command after the transaction completes
        setTimeout(() => {
          command.command(editor);
        }, 0);
        
        return true;
      },
    } as any;
  },
});
