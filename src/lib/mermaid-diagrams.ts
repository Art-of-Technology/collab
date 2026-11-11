// Mermaid diagrams for rendered code blocks. Stored content is never changed; the renderer is
// downloaded only when a page actually contains a diagram.

const FIRST_LINE = /^(?:(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b|(?:sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|journey|gitGraph|mindmap|timeline)\b|pie(?:\s+(?:title|showData)\b|$))/;

/** The diagram source of a code block, or null when the block is ordinary code. */
export function diagramSource(language: string | null | undefined, text: string): string | null {
  const source = text.trim();
  if (!source) return null;
  if (language === 'mermaid') return source;
  if (language) return null;
  // Untagged blocks count only when their first content line opens a diagram.
  const first = source.split('\n').map(line => line.trim()).find(line => line && !line.startsWith('%%')) ?? '';
  return FIRST_LINE.test(first) ? source : null;
}

const rendered = new Map<string, string>();
let renderCount = 0;

/**
 * A block that shows the diagram for `source`, or a short error when it cannot be drawn.
 * `onResult` reports whether the diagram was drawn, so a caller can keep the code block visible.
 */
export function diagramElement(source: string, onResult?: (drawn: boolean) => void): HTMLElement {
  const box = document.createElement('div');
  box.className = 'mermaid-diagram';
  box.contentEditable = 'false';
  const dark = document.documentElement.classList.contains('dark');
  const key = `${dark ? 'dark' : 'light'}:${source}`;
  const show = (svg: string) => {
    box.innerHTML = svg;
    box.dataset.state = 'drawn';
    onResult?.(true);
  };
  const cached = rendered.get(key);
  if (cached) {
    show(cached);
    return box;
  }
  void (async () => {
    try {
      const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([import('mermaid'), import('dompurify')]);
      // Strict mode encodes markup in labels and disables click handlers; SVG text labels keep the
      // output free of embedded HTML, so the second sanitizing pass can use the plain SVG profile.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        htmlLabels: false,
        theme: dark ? 'dark' : 'default',
        flowchart: { useMaxWidth: false },
        sequence: { useMaxWidth: false },
      });
      const { svg } = await mermaid.render(`mermaid-diagram-${++renderCount}`, source);
      const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
      if (rendered.size >= 50) rendered.clear();
      rendered.set(key, clean);
      show(clean);
    } catch (error) {
      const reason = String((error as { message?: unknown })?.message ?? error).split('\n')[0].slice(0, 160);
      box.dataset.state = 'error';
      box.textContent = `Diagram could not be drawn: ${reason}`;
      onResult?.(false);
    }
  })();
  return box;
}

/** Draws every diagram code block inside read-only rendered content, hiding the source once drawn. */
export function renderDiagrams(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('pre > code').forEach(code => {
    const pre = code.parentElement as HTMLElement;
    if (pre.previousElementSibling?.classList.contains('mermaid-diagram')) return;
    const source = diagramSource(/(?:^|\s)language-(\S+)/.exec(code.className)?.[1], code.textContent ?? '');
    if (source) pre.before(diagramElement(source, drawn => { pre.hidden = drawn; }));
  });
}
