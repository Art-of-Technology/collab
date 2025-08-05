import type { Tag, Note, NoteTag } from '../types/models';
  
  export function sortTagsBySearchTerm<T extends Tag>(tags: T[], searchTerm: string): T[] {
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
  // Cache timestamps for all notes
  const notesWithTimestamps = notes.map(note => ({
    note,
    timestamp: new Date(note.updatedAt).getTime()
  }));

  if (!searchTerm.trim()) {
    // Sort by updatedAt desc using cached timestamps
    return notesWithTimestamps
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(item => item.note);
  }

  const term = searchTerm.toLowerCase();
  return notesWithTimestamps
    .sort((a, b) => {
      const aStartsWith = a.note.title.toLowerCase().startsWith(term);
      const bStartsWith = b.note.title.toLowerCase().startsWith(term);
      
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      // If both start with or both don't start with, sort by updatedAt desc
      return b.timestamp - a.timestamp;
    })
    .map(item => item.note);
} 