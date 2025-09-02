import type { Editor } from "@tiptap/react";

export interface SlashCommandCallbacks {
  setSlashQuery: (query: string) => void;
  setSelectedSlashIndex: (index: number) => void;
  hideSlashMenu: () => void;
}

/**
 * Handles slash command query updates based on the current editor state.
 * This utility extracts and validates slash command queries from the editor content.
 * 
 * @param editor - The TipTap editor instance
 * @param callbacks - Callback functions to update slash command state
 */
export function handleSlashCommandUpdate(
  editor: Editor,
  callbacks: SlashCommandCallbacks
): void {
  const { setSlashQuery, setSelectedSlashIndex, hideSlashMenu } = callbacks;
  
  const { from } = editor.state.selection;
  const beforeText = editor.state.doc.textBetween(Math.max(0, from - 50), from, ' ', ' ');
  const slashIndex = beforeText.lastIndexOf('/');
  
  // Check if there's a slash at the expected position and no spaces after it
  if (slashIndex !== -1) {
    const textAfterSlash = beforeText.substring(slashIndex + 1);
    // Only keep menu open if there are no spaces after the slash (which would break the command)
    if (!textAfterSlash.includes(' ')) {
      setSlashQuery(textAfterSlash);
      setSelectedSlashIndex(0);
    } else {
      hideSlashMenu();
    }
  } else {
    hideSlashMenu();
  }
}
