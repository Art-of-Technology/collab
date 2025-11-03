import { Editor } from '@tiptap/react';
import { IssueType } from '../types';

export const MENTION_TRIGGERS = {
  user: '@',
  issue: '#'
} as const;

export const NODE_TYPE_MAP = {
  '@': 'mention',
  '#': 'issueMention'
} as const;

export function findMentionTrigger(
  editor: Editor,
  currentPosition: number
): { position: number; char: string; query: string; type: 'user' | 'issue' } | null {
  const searchLimit = Math.max(0, currentPosition - 50);
  let triggerPosition = -1;
  let triggerChar = '';
  let textAfterTrigger = '';

  editor.state.doc.nodesBetween(searchLimit, currentPosition, (node, pos) => {
    if (triggerPosition !== -1) return false;

    if (node.isText) {
      const nodeText = node.textContent || '';
      let searchFromIndex = currentPosition - pos - 1;
      const triggers = ['@', '#'];

      for (const trigger of triggers) {
        const processedPositions = new Set<number>();
        let relativeTriggerPos = nodeText.lastIndexOf(trigger, searchFromIndex);
        let iterationCount = 0;

        while (relativeTriggerPos !== -1 && relativeTriggerPos >= 0 && iterationCount < 100) {
          iterationCount++;
          const absoluteTriggerPos = pos + relativeTriggerPos;

          if (processedPositions.has(absoluteTriggerPos)) break;

          if (absoluteTriggerPos >= searchLimit && absoluteTriggerPos < currentPosition) {
            textAfterTrigger = editor.state.doc.textBetween(absoluteTriggerPos + 1, currentPosition, "");

            if (!textAfterTrigger.match(/^\s/) && !triggers.some(t => textAfterTrigger.includes(t))) {
              triggerPosition = absoluteTriggerPos;
              triggerChar = trigger;
              return false;
            } else {
              processedPositions.add(absoluteTriggerPos);
              relativeTriggerPos = nodeText.lastIndexOf(trigger, Math.max(0, relativeTriggerPos - 1));
              continue;
            }
          } else {
            break;
          }
        }
      }
    }
    return true;
  });

  if (triggerPosition !== -1) {
    const type = triggerChar === '@' ? 'user' : 'issue';
    return {
      position: triggerPosition,
      char: triggerChar,
      query: textAfterTrigger,
      type
    };
  }

  return null;
}

export function insertMention(
  editor: Editor,
  mention: { id: string; label: string; title?: string; type?: string },
  triggerPosition: number,
  currentPosition: number,
  triggerChar: string
) {
  if (!editor || !mention || typeof triggerPosition !== 'number' || typeof currentPosition !== 'number') {
    console.error('Invalid parameters passed to insertMention:', { editor: !!editor, mention, triggerPosition, currentPosition, triggerChar });
    return;
  }

  try {
    const docSize = editor.state.doc.content.size;
    const fromPos = Math.max(0, Math.min(triggerPosition, docSize));
    const toPos = Math.max(fromPos, Math.min(currentPosition, docSize));
    if (fromPos >= toPos || toPos > docSize) {
      console.warn('Invalid range for mention insertion:', { fromPos, toPos, docSize });
      return;
    }

    const safeLabel = mention.label || 'Unknown';
    const safeId = mention.id || '';
    const isUser = triggerChar === '@';

    editor
      .chain()
      .focus()
      .deleteRange({ from: fromPos, to: toPos })
      .insertContent({
        type: isUser ? 'mention' : 'issueMention',
        attrs: isUser
          ? { id: safeId, label: safeLabel }
          : {
            id: safeId,
            label: safeLabel,
            title: mention.title || '',
            type: mention.type || 'TASK',
          },
      })
      // make sure the cursor lands after the inserted inline node
      .focus('end')
      .run();

    // Optional: a quick blur/focus can help some setups commit decorations
    editor.commands.blur();
    editor.commands.focus('end');
  } catch (error) {
    console.error('Error inserting mention:', error);
    try {
      editor
        .chain()
        .focus()
        .deleteRange({ from: triggerPosition, to: currentPosition })
        .insertContent(`${triggerChar}${mention.label}`)
        .focus('end')
        .run();
      editor.commands.blur();
      editor.commands.focus('end');
    } catch (fallbackError) {
      console.error('Fallback mention insertion also failed:', fallbackError);
    }
  }
}