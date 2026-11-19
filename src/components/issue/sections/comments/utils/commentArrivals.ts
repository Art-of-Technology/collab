import type { IssueComment } from '../types/comment';

export function flattenCommentIds(comments: IssueComment[]): Map<string, IssueComment> {
  const result = new Map<string, IssueComment>();
  const visit = (items: IssueComment[]) => items.forEach(comment => {
    if (result.has(comment.id)) return;
    result.set(comment.id, comment);
    if (comment.replies) visit(comment.replies);
  });
  visit(comments);
  return result;
}

/** Keep deleted IDs in the history so refetches/restores do not announce them again. */
export function findCommentArrivals(seen: Set<string>, comments: IssueComment[], currentUserId?: string): string[] {
  const incoming: string[] = [];
  flattenCommentIds(comments).forEach(comment => {
    if (!seen.has(comment.id) && !comment.id.startsWith('temp-') &&
        currentUserId && comment.author.id !== currentUserId) incoming.push(comment.id);
    seen.add(comment.id);
  });
  return incoming;
}

/** Check the visible intersection of the window and every clipping/scroll parent. */
export function commentNeedsScroll(element: HTMLElement): boolean {
  let top = 0;
  let bottom = window.innerHeight;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
      const rect = parent.getBoundingClientRect();
      const innerTop = rect.top + parent.clientTop;
      top = Math.max(top, innerTop);
      bottom = Math.min(bottom, innerTop + parent.clientHeight);
    }
  }
  const rect = element.getBoundingClientRect();
  // A comment taller than the viewport is readable when its beginning is visible.
  // Align its beginning, never its bottom, when bringing it into view.
  if (rect.height > bottom - top) return rect.top < top || rect.top >= bottom - 32;
  return rect.top < top || rect.bottom > bottom;
}
