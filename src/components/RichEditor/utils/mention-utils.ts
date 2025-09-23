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

      // Check for trigger characters: @ for users, # for issues
      const triggers = ['@', '#'];

      for (const trigger of triggers) {
        // Track processed positions to avoid infinite loops
        const processedPositions = new Set<number>();
        let relativeTriggerPos = nodeText.lastIndexOf(trigger, searchFromIndex);
        let iterationCount = 0;
        const maxIterations = 100; // Prevent infinite loops

        while (relativeTriggerPos !== -1 && relativeTriggerPos >= 0 && iterationCount < maxIterations) {
          iterationCount++;
          const absoluteTriggerPos = pos + relativeTriggerPos;

          // Skip if we've already processed this position
          if (processedPositions.has(absoluteTriggerPos)) {
            break;
          }

          if (absoluteTriggerPos >= searchLimit && absoluteTriggerPos < currentPosition) {
            textAfterTrigger = editor.state.doc.textBetween(absoluteTriggerPos + 1, currentPosition, "");

            // Only trigger if there's no whitespace immediately after trigger and no nested triggers
            if (!textAfterTrigger.match(/^\s/) && !triggers.some(t => textAfterTrigger.includes(t))) {
              triggerPosition = absoluteTriggerPos;
              triggerChar = trigger;
              return false;
            } else {
              // Mark this position as processed and skip it
              processedPositions.add(absoluteTriggerPos);

              // Search for the next occurrence before this position
              const nextSearchIndex = Math.max(0, relativeTriggerPos - 1);
              relativeTriggerPos = nodeText.lastIndexOf(trigger, nextSearchIndex);
              continue; // Skip to next iteration
            }
          } else {
            break; // Break out of while loop if position is outside range
          }

          // Only search for the next occurrence if we didn't find a valid trigger
          const nextSearchIndex = Math.max(0, relativeTriggerPos - 1);
          relativeTriggerPos = nodeText.lastIndexOf(trigger, nextSearchIndex);
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
  // Validate inputs
  if (!editor || !mention || typeof triggerPosition !== 'number' || typeof currentPosition !== 'number') {
    console.error('Invalid parameters passed to insertMention:', { editor: !!editor, mention, triggerPosition, currentPosition, triggerChar });
    return;
  }

  try {
    // Ensure the range is valid
    const docSize = editor.state.doc.content.size;
    const fromPos = Math.max(0, Math.min(triggerPosition, docSize));
    const toPos = Math.max(fromPos, Math.min(currentPosition, docSize));

    // Validate the range is sensible
    if (fromPos >= toPos || toPos > docSize) {
      console.warn('Invalid range for mention insertion:', { fromPos, toPos, docSize });
      return;
    }

    // Create proper TipTap nodes instead of raw HTML
    if (triggerChar === '@') {
      // User mention - create proper node
      const safeLabel = mention.label || 'Unknown User';
      const safeId = mention.id || '';

      editor
        .chain()
        .focus()
        .deleteRange({ from: fromPos, to: toPos })
        .insertContent({
          type: 'mention',
          attrs: {
            id: safeId,
            label: safeLabel,
          },
        })
        .insertContent(' ')
        .run();
    } else if (triggerChar === '#') {
      // Issue mention - create proper node
      const safeLabel = mention.label || 'Unknown Issue';
      const safeType = mention.type || 'TASK';
      const safeTitle = mention.title || '';
      const safeId = mention.id || '';

      editor
        .chain()
        .focus()
        .deleteRange({ from: fromPos, to: toPos })
        .insertContent({
          type: 'issueMention',
          attrs: {
            id: safeId,
            label: safeLabel,
            title: safeTitle,
            type: safeType,
          },
        })
        .insertContent(' ')
        .run();
    }
  } catch (error) {
    console.error('Error inserting mention:', error);
    // Fallback: just insert the text
    try {
      const fallbackText = triggerChar + mention.label;
      editor.chain()
        .focus()
        .deleteRange({ from: triggerPosition, to: currentPosition })
        .insertContent(fallbackText + ' ')
        .run();
    } catch (fallbackError) {
      console.error('Fallback mention insertion also failed:', fallbackError);
    }
  }
}
