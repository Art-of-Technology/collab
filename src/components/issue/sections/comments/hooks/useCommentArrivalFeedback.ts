'use client';

import { useEffect, useRef, useState } from 'react';
import type { IssueComment } from '../types/comment';
import { commentNeedsScroll, findCommentArrivals, flattenCommentIds } from '../utils/commentArrivals';

const HIGHLIGHT_MS = 800;

export function useCommentArrivalFeedback(issueId: string, comments: IssueComment[], ready: boolean, currentUserId?: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const history = useRef<Set<string> | null>(null);
  const announcedIssue = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    history.current = null;
    announcedIssue.current = null;
    setHighlightedIds(new Set());
    return () => {
      audio.current?.pause();
      audio.current = null;
    };
  }, [issueId]);

  useEffect(() => {
    // Establish a silent baseline after the first successful HTTP load, not from
    // potentially stale initial props. Optimistic mutation renders are not arrivals.
    if (!ready) return;
    if (!history.current) {
      history.current = new Set(flattenCommentIds(comments).keys());
      return;
    }
    const incoming = findCommentArrivals(history.current, comments, currentUserId);
    if (incoming.length) {
      announcedIssue.current = issueId;
      setHighlightedIds(new Set(incoming));
    }
  }, [issueId, comments, ready, currentUserId]);

  useEffect(() => {
    if (!highlightedIds.size || announcedIssue.current !== issueId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Wait for highlighted replies and any collapsed ancestors to render.
    const frame = requestAnimationFrame(() => {
      const elements = containerRef.current?.querySelectorAll<HTMLElement>('[data-comment-id]');
      const first = elements && Array.from(elements).find(element => highlightedIds.has(element.dataset.commentId!));
      if (first && commentNeedsScroll(first)) {
        first.scrollIntoView({
          block: 'start', inline: 'nearest',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }
      // Autoplay restrictions or an unavailable sound must never break comment reads.
      try {
        audio.current ??= new Audio('/sounds/new-comment.mp3');
        audio.current.volume = 0.35;
        audio.current.currentTime = 0;
        void audio.current.play().catch(() => {});
      } catch { /* Audio is optional when the browser does not permit playback. */ }
      timer = setTimeout(() => setHighlightedIds(new Set()), HIGHLIGHT_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [highlightedIds, issueId]);

  return { containerRef, highlightedIds };
}
