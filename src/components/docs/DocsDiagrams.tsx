'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { renderDiagrams } from '@/lib/mermaid-diagrams';

/** Draws the Mermaid code blocks of the page it wraps, once the page is on screen. */
export function DocsDiagrams({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (container.current) renderDiagrams(container.current);
  }, []);
  return <div ref={container}>{children}</div>;
}
