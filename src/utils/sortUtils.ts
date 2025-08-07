interface Tag {
  id: string;
  name: string;
}

interface Note {
  id: string;
  title: string;
  updatedAt: string;
}

export function sortTagsBySearchTerm(tags: Tag[], searchTerm: string): Tag[] {
  if (!searchTerm.trim()) return tags;

  const term = searchTerm.toLowerCase();
  const filtered = tags.filter(tag =>
    tag.name.toLowerCase().includes(term)
  );

  // Sort: tags starting with search term first, then others
  return filtered.sort((a, b) => {
    const aStartsWith = a.name.toLowerCase().startsWith(term);
    const bStartsWith = b.name.toLowerCase().startsWith(term);

    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    // If both start with or both don't start with, sort alphabetically
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

export function sortNotesBySearchTerm(notes: Note[], searchTerm: string): Note[] {
  if (!searchTerm.trim()) return notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const term = searchTerm.toLowerCase();
  return notes.sort((a, b) => {
    const aStartsWith = a.title.toLowerCase().startsWith(term);
    const bStartsWith = b.title.toLowerCase().startsWith(term);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    
    // If both start with or both don't start with, sort by updatedAt desc
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
} 