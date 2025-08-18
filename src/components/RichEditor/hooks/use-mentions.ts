import { useState, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { findMentionTrigger, insertMention, getCaretPosition } from '../utils';
import { MentionSuggestion, User, Issue } from '../types';

export function useMentions(editor: Editor | null) {
  const [mentionSuggestion, setMentionSuggestion] = useState<MentionSuggestion | null>(null);

  const checkForMentionTrigger = useCallback(() => {
    if (!editor) return;

    const { from } = editor.state.selection;
    const trigger = findMentionTrigger(editor, from);

    if (trigger) {
      const position = getCaretPosition(editor, trigger.position);
      setMentionSuggestion({
        position,
        query: trigger.query,
        type: trigger.type
      });
    } else {
      setMentionSuggestion(null);
    }
  }, [editor]);

  const insertUserMention = useCallback((user: User) => {
    if (!editor || !mentionSuggestion) return;

    const { from } = editor.state.selection;
    const trigger = findMentionTrigger(editor, from);
    
    if (trigger) {
      insertMention(
        editor,
        {
          id: user.id,
          label: user.name || user.email,
          title: user.name || undefined
        },
        trigger.position,
        from,
        trigger.char
      );
    }
    
    setMentionSuggestion(null);
  }, [editor, mentionSuggestion]);

  const insertIssueMention = useCallback((issue: Issue) => {
    if (!editor || !mentionSuggestion) return;

    const { from } = editor.state.selection;
    const trigger = findMentionTrigger(editor, from);
    
    if (trigger) {
      insertMention(
        editor,
        {
          id: issue.id,
          label: issue.issueKey || issue.title,
          title: issue.title,
          type: issue.type
        },
        trigger.position,
        from,
        trigger.char
      );
    }
    
    setMentionSuggestion(null);
  }, [editor, mentionSuggestion]);

  const closeMentionSuggestion = useCallback(() => {
    setMentionSuggestion(null);
  }, []);

  return {
    mentionSuggestion,
    checkForMentionTrigger,
    insertUserMention,
    insertIssueMention,
    closeMentionSuggestion
  };
}
