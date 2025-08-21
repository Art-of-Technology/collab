import { Node, mergeAttributes } from '@tiptap/core';

export const IssueMentionExtension = Node.create({
  name: 'issueMention',

  group: 'inline',

  inline: true,

  selectable: false,

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          return {
            'data-id': attributes.id,
          }
        },
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
        renderHTML: attributes => {
          if (!attributes.label) {
            return {}
          }
          return {
            'data-label': attributes.label,
          }
        },
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {}
          }
          return {
            'data-title': attributes.title,
          }
        },
      },
      type: {
        default: 'TASK',
        parseHTML: element => element.getAttribute('data-issue-type'),
        renderHTML: attributes => {
          return {
            'data-issue-type': attributes.type,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="issue-mention"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const getTypeConfig = (type: string) => {
      switch (type) {
        case 'EPIC':
          return { color: '#a855f7', icon: '⋄' };
        case 'STORY':
          return { color: '#22c55e', icon: '○' };
        case 'TASK':
          return { color: '#6366f1', icon: '☑' };
        case 'BUG':
          return { color: '#ef4444', icon: '●' };
        case 'MILESTONE':
          return { color: '#f59e0b', icon: '▲' };
        case 'SUBTASK':
          return { color: '#6b7280', icon: '◻' };
        default:
          return { color: '#6366f1', icon: '☑' };
      }
    };

    const label = HTMLAttributes.label || HTMLAttributes['data-label'] || 'Unknown Issue';
    const type = HTMLAttributes.type || HTMLAttributes['data-issue-type'] || 'TASK';
    const title = HTMLAttributes.title || HTMLAttributes['data-title'] || '';
    const issueId = HTMLAttributes.id || HTMLAttributes['data-id'] || '';
    const typeConfig = getTypeConfig(type);

    return [
      'span',
      mergeAttributes(
        {
          'data-type': 'issue-mention',
          'data-id': issueId,
          'data-issue-id': issueId,
          'data-issue-key': label,
          'data-label': label,
          'data-title': title,
          'data-issue-type': type,
          class: 'issue-mention inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-5 leading-tight border border-[#2d2d30] bg-[#181818] text-[#cccccc] cursor-pointer hover:border-[#464649] hover:bg-[#1a1a1a] transition-colors',
          title: `Click to view issue: ${title || label}`,
        },
        HTMLAttributes
      ),
      [
        'span',
        { 
          class: 'h-3.5 w-3.5 flex items-center justify-center text-xs',
          style: `color: ${typeConfig.color}`,
        },
        typeConfig.icon,
      ],
      [
        'span',
        { class: 'text-[#cccccc] text-xs' },
        label,
      ],
      [
        'span',
        {
          class: 'issue-mention-external-icon text-white text-xs font-bold'
        },
        '❯'
      ],
    ]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isMention = false
          const { selection } = state
          const { empty, anchor } = selection

          if (!empty) {
            return false
          }

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isMention = true
              tr.insertText('', pos, pos + node.nodeSize)
              return false
            }
          })

          return isMention
        }),
    }
  },
});
