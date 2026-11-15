import MiniSearch from 'minisearch';

// One search for the documentation. The browser runs it on /docs-index.json and the agent API runs it on the
// same entries (docsIndex in src/lib/docs.ts), so a person and an agent get the same sections in the same order.

/** One heading section of a page; the part above the first heading carries the page title. `id` is its address for people. */
export type DocsIndexEntry = { id: string; slug: string; title: string; heading: string; anchor: string; text: string };
export type DocsHit = { slug: string; title: string; heading: string; anchor: string; href: string; excerpt: string };

const EXCERPT = 160;
const built = new WeakMap<DocsIndexEntry[], MiniSearch<DocsIndexEntry>>();

// The words around the first match, cut at spaces.
function excerpt(text: string, terms: string[]): string {
  if (text.length <= EXCERPT) return text;
  const lower = text.toLowerCase();
  const found = terms.map(term => lower.indexOf(term)).filter(at => at >= 0);
  const start = found.length ? text.lastIndexOf(' ', Math.min(...found) - 40) + 1 : 0;
  const end = start + EXCERPT >= text.length ? text.length : text.lastIndexOf(' ', start + EXCERPT);
  return `${start ? '… ' : ''}${text.slice(start, end)}${end < text.length ? ' …' : ''}`;
}

export function searchDocs(index: DocsIndexEntry[], query: string, limit = 8): DocsHit[] {
  if (!query.trim()) return [];
  let search = built.get(index);
  if (!search) {
    search = new MiniSearch<DocsIndexEntry>({ fields: ['heading', 'title', 'text'], storeFields: ['slug', 'title', 'heading', 'anchor', 'text'] });
    search.addAll(index);
    built.set(index, search);
  }
  // The start of a word is enough, and one wrong letter in five is forgiven.
  return search.search(query, { prefix: true, fuzzy: 0.2, boost: { heading: 3, title: 2 } }).slice(0, limit).map(hit => ({
    slug: hit.slug, title: hit.title, heading: hit.heading, anchor: hit.anchor, href: hit.id, excerpt: excerpt(hit.text, hit.terms),
  }));
}
