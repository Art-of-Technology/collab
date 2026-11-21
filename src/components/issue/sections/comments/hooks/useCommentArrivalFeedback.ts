'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IssueComment } from '../types/comment';
import { commentNeedsScroll, findCommentArrivals, flattenCommentIds } from '../utils/commentArrivals';

const HIGHLIGHT_MS = 800;

export function useCommentArrivalFeedback(issueId: string, comments: IssueComment[], ready: boolean, currentUserId?: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const history = useRef<Set<string> | null>(null);
  const announcedIssue = useRef<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const playbackAttempt = useRef({ value: 0 });
  const [soundError, setSoundError] = useState<'blocked' | 'unavailable' | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const attempts = playbackAttempt.current;
    history.current = null;
    announcedIssue.current = null;
    setHighlightedIds(new Set());
    setSoundError(null);
    return () => {
      attempts.value++;
      audio.current?.pause();
      audio.current = null;
    };
  }, [issueId]);

  // Called directly by the button as well as by arrivals. Keeping play() inside
  // the click handler lets the browser grant playback on this same audio element.
  const playSound = useCallback(() => {
    const attempt = ++playbackAttempt.current.value;
    const failed = (error: unknown) => {
      if (attempt !== playbackAttempt.current.value) return;
      const name = (error as { name?: string } | null)?.name;
      if (name === 'AbortError') return;
      setSoundError(name === 'NotAllowedError' ? 'blocked' : 'unavailable');
    };
    try {
      audio.current ??= new Audio('/sounds/new-comment.mp3');
      // A failed media resource stays in an error state until explicitly reloaded.
      if (audio.current.error) audio.current.load();
      audio.current.volume = 0.35;
      audio.current.currentTime = 0;
      void audio.current.play().then(() => {
        if (attempt === playbackAttempt.current.value) setSoundError(null);
      }).catch(failed);
    } catch (error) {
      failed(error);
    }
  }, []);

  useEffect(() => {
    // Establish a silent baseline after the first successful HTTP load, not from
    // potentially stale initial props. Optimistic mutation renders are not arrivals.
    if (!ready) return;
    if (!history.current) {
      history.current = new Set(flattenCommentIds(comments).keys());
      return;
    }
    // Keep arrivals pending until we can distinguish remote comments from our own.
    if (!currentUserId) return;
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
      // Playback failure is recoverable without interrupting comments or highlighting.
      playSound();
      timer = setTimeout(() => setHighlightedIds(new Set()), HIGHLIGHT_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [highlightedIds, issueId, playSound]);

  return { containerRef, highlightedIds, soundError, playSound };
}
