import { Extension } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { diagramElement, diagramSource } from '@/lib/mermaid-diagrams';

// Shows the diagram above each Mermaid code block. These are view decorations only: the document,
// and so the saved content, keeps the code block exactly as written.
function previews(doc: Node): DecorationSet {
  const widgets: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'codeBlock') return true;
    const source = diagramSource(node.attrs.language, node.textContent);
    // Keyed by source, so typing elsewhere in the document does not redraw the diagram.
    if (source) widgets.push(Decoration.widget(pos, () => diagramElement(source), { key: source, side: -1 }));
    return false;
  });
  return DecorationSet.create(doc, widgets);
}

const key = new PluginKey<DecorationSet>('mermaidPreview');

export const MermaidPreviewExtension = Extension.create({
  name: 'mermaidPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => previews(state.doc),
          apply: (transaction, current) => (transaction.docChanged ? previews(transaction.doc) : current),
        },
        props: { decorations: state => key.getState(state) },
      }),
    ];
  },
});
