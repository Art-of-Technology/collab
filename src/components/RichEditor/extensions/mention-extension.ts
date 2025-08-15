import { Node, mergeAttributes } from '@tiptap/core';

export const MentionExtension = Node.create({
  name: 'mention',

  group: 'inline',

  inline: true,

  selectable: false,

  atom: true,
  
  draggable: false,

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
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="mention"]',
        getAttrs: (element) => {
          return {
            id: element.getAttribute('data-id'),
            label: element.getAttribute('data-label'),
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const label = HTMLAttributes.label || HTMLAttributes['data-label'] || 'Unknown User';
    const userId = HTMLAttributes.id || HTMLAttributes['data-id'] || '';
    
    return [
      'span',
      mergeAttributes(
        {
          'data-type': 'mention',
          'data-id': userId,
          'data-user-id': userId,
          'data-label': label,
          class: 'mention inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-5 leading-tight border border-[#2d2d30] bg-[#181818] text-[#cccccc] cursor-pointer hover:border-[#464649] hover:bg-[#1a1a1a] transition-colors',
          title: `Click to view ${label}'s profile`,
        },
        HTMLAttributes
      ),
      [
        'span',
        { 
          class: 'h-3.5 w-3.5 rounded-full bg-[#333] flex items-center justify-center text-[8px] font-medium text-[#cccccc]',
        },
        label.charAt(0).toUpperCase(),
      ],
      [
        'span',
        { class: 'text-[#cccccc] text-xs truncate max-w-[80px]' },
        label,
      ],
      [
        'span',
        {
          class: 'mention-external-icon text-white text-xs font-bold'
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
