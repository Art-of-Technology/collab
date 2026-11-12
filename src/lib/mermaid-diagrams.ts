// Mermaid diagrams for rendered code blocks. Stored content is never changed; the renderer is
// downloaded only when a page actually contains a diagram.
import type { Mermaid } from 'mermaid';
import { rendererUrl } from './mermaid-renderer-url';

declare global {
  interface Window {
    mermaid?: Mermaid;
  }
}

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

let renderer: Promise<Mermaid> | undefined;

// The renderer is the package's prebuilt file, added to the page as a script the first time a
// diagram is drawn. Compiling its sources took the production build past its memory limit.
function loadRenderer(): Promise<Mermaid> {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  return (renderer ??= new Promise<Mermaid>((resolve, reject) => {
    const failed = () => {
      renderer = undefined;
      reject(new Error('the diagram renderer did not load'));
    };
    const script = document.createElement('script');
    script.src = rendererUrl;
    script.onload = () => (window.mermaid ? resolve(window.mermaid) : failed());
    script.onerror = failed;
    document.head.append(script);
  }));
}

const FULL = 'mermaid-diagram-full';

/**
 * The controls above a drawing. Inside its block the drawing is fitted; "Full screen" opens it over
 * the whole window, where it can be zoomed, and the same control brings it back.
 */
function viewControls(box: HTMLElement, canvas: HTMLElement, drawing: SVGElement, width: number, height: number): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'mermaid-diagram-bar';
  const dialog = document.createElement('dialog');
  const placeholder = document.createComment('diagram');
  const observer = new MutationObserver(() => {
    if (dialog.open ? !box.isConnected : !placeholder.isConnected) {
      observer.disconnect();
      window.removeEventListener('keydown', escapeFallback, true);
      if (dialog.open) dialog.close();
      else box.remove();
    }
  });
  const escapeFallback = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      setFull(false);
    }
  };
  const level = document.createElement('output');
  level.dataset.zoom = '';
  let zoom = 1;
  const setZoom = (next: number) => {
    zoom = Math.min(8, Math.max(0.1, next));
    Object.assign(drawing.style, { width: `${Math.round(width * zoom)}px`, maxWidth: 'none', minWidth: '0px' });
    level.textContent = `${Math.round(zoom * 100)}%`;
  };
  // The whole drawing in view. Before the page has a layout there is no size to fit to.
  const fitWindow = () => {
    const fit = Math.min(canvas.clientWidth / width, canvas.clientHeight / height);
    setZoom(fit > 0 ? fit : 1);
  };
  // Fitted to its block: at its natural size at most, and no smaller than two fifths of it, where
  // labels stop being readable. Past that the drawing's area scrolls sideways.
  const fitBlock = () => {
    Object.assign(drawing.style, { width: '100%', maxWidth: `${width}px`, minWidth: `${width * 0.4}px` });
    level.textContent = '100%';
  };
  const control = (text: string, label: string, action: () => void, zoomOnly = true) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    if (label !== text) button.setAttribute('aria-label', label);
    if (zoomOnly) button.dataset.zoom = '';
    button.addEventListener('click', action);
    return button;
  };
  const setFull = (full: boolean) => {
    if (!full && (dialog.open || placeholder.parentNode)) {
      observer.disconnect();
      window.removeEventListener('keydown', escapeFallback, true);
      if (dialog.open) {
        dialog.close();
        box.replaceChildren(...Array.from(dialog.childNodes));
      } else {
        placeholder.replaceWith(box);
        delete box.dataset.windowFallback;
      }
      box.classList.remove(FULL);
      toggle.textContent = 'Full screen';
      fitBlock();
      // Moving the controls back to the block drops keyboard focus; return it to the control that opened the view.
      toggle.focus();
      return;
    }
    box.classList.toggle(FULL, full);
    toggle.textContent = full ? 'Exit full screen' : 'Full screen';
    if (full) fitWindow();
    else fitBlock();
  };
  const toggle = control('Full screen', 'Full screen', () => {
    if (document.fullscreenElement === box) void document.exitFullscreen();
    else if (box.classList.contains(FULL)) setFull(false);
    // A browser without element full screen, or one that refuses it, gets a block that covers the window.
    else Promise.resolve().then(() => box.requestFullscreen()).catch(() => {
      if (!box.isConnected) return;
      if (typeof dialog.showModal === 'function') {
        dialog.append(...Array.from(box.childNodes));
        box.append(dialog);
        dialog.showModal();
      } else {
        box.before(placeholder);
        document.body.append(box);
        box.dataset.windowFallback = '';
      }
      window.addEventListener('keydown', escapeFallback, true);
      observer.observe(document, { childList: true, subtree: true });
      setFull(true);
    });
  }, false);
  box.addEventListener('fullscreenchange', () => setFull(document.fullscreenElement === box));
  box.addEventListener('keydown', event => {
    if (!box.classList.contains(FULL)) return;
    if (event.key === '+' || event.key === '=') setZoom(zoom * 1.25);
    else if (event.key === '-') setZoom(zoom / 1.25);
    else if (event.key === '0') setZoom(1);
    // True full screen closes on Escape by itself; the covering block has to do it here.
    else if (event.key === 'Escape' && document.fullscreenElement !== box) {
      event.stopPropagation();
      setFull(false);
    }
  });
  bar.append(
    control('−', 'Zoom out', () => setZoom(zoom / 1.25)),
    level,
    control('+', 'Zoom in', () => setZoom(zoom * 1.25)),
    control('Fit', 'Fit to window', fitWindow),
    control('100%', 'Actual size', () => setZoom(1)),
    toggle,
  );
  fitBlock();
  return bar;
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
    const canvas = document.createElement('div');
    canvas.className = 'mermaid-diagram-canvas';
    canvas.innerHTML = svg;
    const drawing = canvas.querySelector('svg');
    const [, , width, height] = (drawing?.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    if (drawing && width && height) box.replaceChildren(viewControls(box, canvas, drawing, width, height), canvas);
    else box.replaceChildren(canvas);
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
      const [mermaid, { default: DOMPurify }] = await Promise.all([loadRenderer(), import('dompurify')]);
      // Strict mode encodes markup in labels and disables click handlers; SVG text labels keep the
      // output free of embedded HTML, so the second sanitizing pass can use the plain SVG profile.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        htmlLabels: false,
        theme: dark ? 'dark' : 'default',
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
    // The description renderer can turn a code block's line breaks into <br> elements, which textContent drops.
    const text = code.cloneNode(true) as HTMLElement;
    text.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    const source = diagramSource(/(?:^|\s)language-(\S+)/.exec(code.className)?.[1], text.textContent ?? '');
    if (source) pre.before(diagramElement(source, drawn => { pre.hidden = drawn; }));
  });
}
