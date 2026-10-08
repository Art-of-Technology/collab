import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { RankedDocument, SearchDocument, SearchQuery } from './agent-search-query';

function trigrams(text: Prisma.Sql) {
  return Prisma.sql`ARRAY(SELECT DISTINCT substring('  ' || word || ' ' FROM n FOR 3)
    FROM regexp_split_to_table(lower(${text}), '[^[:alnum:]_]+') AS word
    CROSS JOIN LATERAL generate_series(1, char_length(word) + 1) AS n WHERE word <> '')`;
}

export function lexicalQuery(query: SearchQuery, documents: SearchDocument[]) {
  const ids = (type: SearchDocument['type']) => documents.filter(d => d.type === type).map(d => d.id);
  const fuzzy = query.mode === 'fuzzy';
  const exact = query.mode === 'exact';
  // Normalize each document once, then inspect query trigrams instead of expanding every body word.
  const paddedWords = (text: Prisma.Sql) => Prisma.sql`'  ' || regexp_replace(lower(${text}), '[^[:alnum:]_]+', '   ', 'g') || ' '`;
  const overlap = (text: Prisma.Sql) => Prisma.sql`(SELECT count(*)::float FROM unnest(q.grams) AS gram WHERE strpos(${text}, gram) > 0) / greatest(1, cardinality(q.grams))`;
  const score = exact ? Prisma.sql`CASE WHEN lower(d.title) = lower(q.text) THEN 2.0 ELSE 1.0 END`
    : fuzzy ? Prisma.sql`greatest(${overlap(Prisma.sql`d.fuzzy_title`)}, ${overlap(Prisma.sql`d.fuzzy_body`)})`
      : Prisma.sql`ts_rank_cd(setweight(to_tsvector('simple', d.title), 'A') || setweight(to_tsvector('simple', d.body), 'B'), q.terms)::float`;
  const matches = exact ? Prisma.sql`strpos(lower(d.title || E'\n' || d.body), lower(q.text)) > 0`
    : fuzzy ? Prisma.sql`score >= 0.5`
      : Prisma.sql`(to_tsvector('simple', d.title) || to_tsvector('simple', d.body)) @@ q.terms`;
  return Prisma.sql`
    WITH documents AS (
      SELECT id, 'issue' AS type, coalesce("issueKey", '') AS identifier, title,
        coalesce(description, '') AS body FROM "Issue" WHERE id = ANY(${ids('issue')}::text[])
      UNION ALL
      SELECT id, 'note', id, title, regexp_replace(content, '<[^>]*>', ' ', 'g')
        FROM "Note" WHERE id = ANY(${ids('note')}::text[])
      UNION ALL
      SELECT a.id, 'activity', a.id, coalesce(i."issueKey", '') || ' ' || a.action || ' ' || coalesce(a."fieldName", ''),
        concat_ws(' ', a.details, a."oldValue", a."newValue")
        FROM "BoardItemActivity" a JOIN "Issue" i ON i.id = a."itemId" AND i."workspaceId" = a."workspaceId"
        WHERE a.id = ANY(${ids('activity')}::text[])
    ), ${fuzzy ? Prisma.sql`normalized AS MATERIALIZED (SELECT d.*, ${paddedWords(Prisma.sql`d.title`)} AS fuzzy_title,
      ${paddedWords(Prisma.sql`d.body`)} AS fuzzy_body FROM documents d),` : Prisma.empty}
    q AS (SELECT ${query.query}::text AS text, websearch_to_tsquery('simple', ${query.query}) AS terms,
      ${fuzzy ? trigrams(Prisma.sql`${query.query}::text`) : Prisma.sql`ARRAY[]::text[]`} AS grams),
    ranked AS MATERIALIZED (SELECT d.*, (lower(d.id) = lower(q.text) OR lower(d.identifier) = lower(q.text)) AS "exactIdentifier",
      ${score} AS score FROM ${fuzzy ? Prisma.sql`normalized` : Prisma.sql`documents`} d CROSS JOIN q)
    SELECT d.id, d.type, d.score, d."exactIdentifier" FROM ranked d CROSS JOIN q
      WHERE d."exactIdentifier" OR ${matches}
      ORDER BY d."exactIdentifier" DESC, d.score DESC, d.type, d.id`;
}

export async function searchLexical(query: SearchQuery, documents: SearchDocument[]): Promise<RankedDocument[]> {
  if (!documents.length) return [];
  const rows = await prisma.$queryRaw<Array<Omit<RankedDocument, 'matchType'>>>(lexicalQuery(query, documents));
  return rows.map(row => ({ ...row, matchType: query.mode === 'exact' || row.exactIdentifier ? 'exact' : query.mode === 'fuzzy' ? 'fuzzy' : 'keyword' }));
}
