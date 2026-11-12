import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { diagramElement, diagramSource } from '@/lib/mermaid-diagrams';

// Shows each Mermaid code block as a diagram. Its source stays in the document and is hidden from
// view until it is opened with the control under the diagram or the cursor moves into it. All of
// this is view decoration, so the saved content keeps the code block exactly as written.
interface Previews {
  /** Start positions of the diagram blocks whose source was opened with the control. */
  open: number[];
  decorations: DecorationSet;
}

const key = new PluginKey<Previews>('mermaidPreview');

function preview(source: string, open: boolean, selected: boolean, view: EditorView, getPos: () => number | undefined): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'mermaid-preview';
  wrapper.contentEditable = 'false';
  const control = document.createElement('button');
  control.type = 'button';
  const updateControl = (error: boolean) => {
    const expanded = open || selected || error;
    control.textContent = expanded ? 'Hide source' : 'Show source';
    control.setAttribute('aria-expanded', String(expanded));
    control.disabled = selected || error;
  };
  updateControl(false);
  control.addEventListener('click', () => {
    const position = getPos();
    if (position !== undefined) {
      const focused = document.activeElement === control;
      view.dispatch(view.state.tr.setMeta(key, position));
      if (focused) (view.nodeDOM(position) as HTMLElement | null)?.previousElementSibling?.querySelector<HTMLElement>(':scope > button')?.focus();
    }
  });
  // The stylesheet keeps the source in view when the diagram could not be drawn.
  wrapper.append(diagramElement(source, drawn => {
    wrapper.dataset.state = drawn ? 'drawn' : 'error';
    updateControl(!drawn);
  }), control);
  return wrapper;
}

function previews(state: EditorState, open: number[]): Previews {
  const decorations: Decoration[] = [];
  const stillOpen: number[] = [];
  const { from, to } = state.selection;
  state.doc.descendants((node, position) => {
    if (node.type.name !== 'codeBlock') return true;
    const source = diagramSource(node.attrs.language, node.textContent);
    if (!source) return false;
    const end = position + node.nodeSize;
    const isOpen = open.includes(position);
    if (isOpen) stillOpen.push(position);
    const cursorInside = (from > position && from < end) || (to > position && to < end);
    // Keyed by source, so typing elsewhere in the document does not redraw the diagram.
    decorations.push(Decoration.widget(position, (view, getPos) => preview(source, isOpen, cursorInside, view, getPos), {
      key: `${isOpen}:${cursorInside}:${source}`, side: -1, stopEvent: () => true,
    }));
    if (!isOpen && !cursorInside) decorations.push(Decoration.node(position, end, { class: 'mermaid-source-collapsed' }));
    return false;
  });
  return { open: stillOpen, decorations: DecorationSet.create(state.doc, decorations) };
}

export const MermaidPreviewExtension = Extension.create({
  name: 'mermaidPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin<Previews>({
        key,
        state: {
          init: (_config, state) => previews(state, []),
          apply(transaction, current, _before, state) {
            const toggled = transaction.getMeta(key) as number | undefined;
            if (!transaction.docChanged && !transaction.selectionSet && toggled === undefined) return current;
            let open = current.open.flatMap(position => {
              const mapped = transaction.mapping.mapResult(position, 1);
              return mapped.deleted ? [] : [mapped.pos];
            });
            if (toggled !== undefined) open = open.includes(toggled) ? open.filter(position => position !== toggled) : [...open, toggled];
            return previews(state, open);
          },
        },
        props: { decorations: state => key.getState(state)?.decorations },
      }),
    ];
  },
});
