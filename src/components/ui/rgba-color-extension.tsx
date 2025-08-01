import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'

export const RgbaColor = Color.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.color,
        renderHTML: (attributes: any) => {
          if (!attributes.color) {
            return {}
          }
          return {
            style: `color: ${attributes.color}`,
          }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setRgbaColor: (color: string) => ({ commands }: any) => {
        return commands.setMark(this.name, { color })
      },
    }
  },
})

export const RgbaTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.color,
        renderHTML: (attributes: any) => {
          if (!attributes.color) {
            return {}
          }
          return {
            style: `color: ${attributes.color}`,
          }
        },
      },
    }
  },
}) 