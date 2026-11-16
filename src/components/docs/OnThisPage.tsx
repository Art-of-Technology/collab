import type { DocHeading } from '@/lib/docs';

/** The headings of the page being read, each a link to its place on the page. */
export function OnThisPage({ headings }: { headings: DocHeading[] }) {
  if (!headings.length) return null;
  return (
    <nav aria-label="On this page" className="space-y-3">
      <p className="mb-4 text-xs font-semibold text-foreground">On this page</p>
      {headings.map(heading => (
        <a key={heading.id} href={`#${heading.id}`} className={`block text-[13px] leading-5 text-collab-400 hover:text-foreground ${heading.depth === 3 ? 'pl-3' : ''}`}>
          {heading.text}
        </a>
      ))}
    </nav>
  );
}
