import { z } from 'zod';

export const searchModes = ['exact', 'keyword', 'semantic', 'hybrid', 'fuzzy'] as const;
export const searchTypes = ['issue', 'note', 'activity'] as const;
const identifier = z.string().trim().min(1).max(128);
const integer = (fallback: number, min: number, max: number) => z.coerce.number().int().min(min).max(max).default(fallback);

export const searchQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
  mode: z.enum(searchModes).default('hybrid'),
  type: z.enum(['all', ...searchTypes]).default('all'),
  projectId: identifier.optional(),
  status: identifier.optional(),
  assigneeId: identifier.optional(),
  after: z.string().datetime({ offset: true }).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: integer(20, 1, 50),
  offset: integer(0, 0, 50000),
  maxTokens: integer(8000, 1024, 64000),
}).strict().refine(value => !value.after || !value.before || new Date(value.after) <= new Date(value.before), {
  message: 'after must not be later than before', path: ['after'],
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchType = typeof searchTypes[number];
export type SearchMode = typeof searchModes[number];
export type SearchDocument = { id: string; type: SearchType; updatedAt: Date; projectId: string | null };
export type RankedDocument = { id: string; type: SearchType; score: number; exactIdentifier: boolean; matchType: SearchMode };

export class SearchError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function documentKey(document: Pick<SearchDocument, 'id' | 'type'>) {
  return `${document.type}:${document.id}`;
}

export function fuseSearchResults(keyword: RankedDocument[], semantic: RankedDocument[]) {
  const merged = new Map<string, RankedDocument>();
  for (const list of [keyword, semantic]) {
    list.forEach((item, rank) => {
      const key = documentKey(item), previous = merged.get(key);
      merged.set(key, { ...item, exactIdentifier: item.exactIdentifier || !!previous?.exactIdentifier,
        score: (previous?.score || 0) + 1 / (60 + rank + 1), matchType: previous ? 'hybrid' : item.matchType });
    });
  }
  return [...merged.values()].sort((a, b) => Number(b.exactIdentifier) - Number(a.exactIdentifier) || b.score - a.score || documentKey(a).localeCompare(documentKey(b)));
}

// A UTF-8 byte budget conservatively bounds byte-based model tokenizers without choosing an agent's model.
export function responseBytes(value: unknown) { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
