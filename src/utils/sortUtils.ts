/**
 * Sorts items by search term priority - items starting with the search term come first,
 * then items containing the search term, then others
 */
export function sortBySearchTerm<T>(
  items: T[],
  searchTerm: string,
  getText: (item: T) => string,
  secondarySort?: (a: T, b: T) => number
): T[] {
  if (!searchTerm.trim()) return items;

  const searchTermLower = searchTerm.toLowerCase();
  
  return items.sort((a, b) => {
    const aText = getText(a).toLowerCase();
    const bText = getText(b).toLowerCase();
    
    const aStartsWith = aText.startsWith(searchTermLower);
    const bStartsWith = bText.startsWith(searchTermLower);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    // If both start with or both don't start with, use secondary sort or alphabetical
    if (secondarySort) {
      return secondarySort(a, b);
    }
    
    // Default to alphabetical sorting
    return aText.localeCompare(bText);
  });
}

/**
 * Sorts notes by search term with updatedAt as secondary sort
 */
export function sortNotesBySearchTerm(
  notes: { title: string; updatedAt: string }[],
  searchTerm: string
): { title: string; updatedAt: string }[] {
  return sortBySearchTerm(notes, searchTerm, (note) => note.title, (a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/**
 * Sorts tags by search term with alphabetical as secondary sort
 */
export function sortTagsBySearchTerm<T extends { name: string }>(
  tags: T[],
  searchTerm: string
): T[] {
  return sortBySearchTerm(tags, searchTerm, (tag) => tag.name);
} 