"use client";

import React, { useRef } from 'react';
import { StickyNote, ChevronLeft, ChevronRight, Lock, Globe, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface NoteTag {
  id: string;
  name: string;
  color: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  isFavorite: boolean;
  updatedAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  tags: NoteTag[];
}

interface NotesCarouselProps {
  notes: Note[];
  onNoteClick?: (noteId: string) => void;
  isLoading?: boolean;
}

// Sticky note colors - subtle pastel variations
const noteColors = [
  { bg: 'bg-amber-500/10', border: 'border-amber-500/20', accent: 'bg-amber-500' },
  { bg: 'bg-blue-500/10', border: 'border-blue-500/20', accent: 'bg-blue-500' },
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', accent: 'bg-emerald-500' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/20', accent: 'bg-purple-500' },
  { bg: 'bg-pink-500/10', border: 'border-pink-500/20', accent: 'bg-pink-500' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', accent: 'bg-cyan-500' },
];

function StickyNoteCard({
  note,
  colorIndex,
  onClick,
}: {
  note: Note;
  colorIndex: number;
  onClick?: () => void;
}) {
  const colors = noteColors[colorIndex % noteColors.length];
  const timeAgo = formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true });

  // Strip HTML/markdown for preview
  const plainContent = note.content
    .replace(/<[^>]*>/g, '')
    .replace(/[#*_~`]/g, '')
    .trim();

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex-shrink-0 w-[200px] h-[180px] rounded-lg border cursor-pointer transition-all duration-200",
        "hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20",
        colors.bg,
        colors.border
      )}
    >
      {/* Top accent bar */}
      <div className={cn("h-1 rounded-t-lg", colors.accent)} />

      <div className="p-3 h-[calc(100%-4px)] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-[13px] font-medium text-[#fafafa] line-clamp-2 leading-tight flex-1">
            {note.title}
          </h4>
          <div className="flex items-center gap-1 flex-shrink-0">
            {note.isFavorite && (
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            )}
            {note.isPublic ? (
              <Globe className="h-3 w-3 text-emerald-400" />
            ) : (
              <Lock className="h-3 w-3 text-[#52525b]" />
            )}
          </div>
        </div>

        {/* Content preview */}
        <p className="text-[11px] text-[#71717a] line-clamp-4 flex-1 leading-relaxed">
          {plainContent.substring(0, 120)}
          {plainContent.length > 120 && '...'}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
          {/* Tags */}
          <div className="flex items-center gap-1 overflow-hidden">
            {note.tags.slice(0, 2).map(tag => (
              <span
                key={tag.id}
                className="px-1.5 py-0.5 rounded text-[9px] truncate max-w-[60px]"
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>

          {/* Time */}
          <span className="text-[10px] text-[#52525b] flex-shrink-0">
            {timeAgo}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NotesCarousel({ notes, onNoteClick, isLoading }: NotesCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 220; // card width + gap
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 py-2">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="flex-shrink-0 w-[200px] h-[180px] rounded-lg bg-[#18181b] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-center">
        <div>
          <StickyNote className="h-8 w-8 text-[#3f3f46] mx-auto mb-2" />
          <p className="text-xs text-[#52525b]">No notes yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Scroll buttons */}
      {notes.length > 3 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 p-0 bg-[#0d0d0e]/90 border border-[#1f1f1f] rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 p-0 bg-[#0d0d0e]/90 border border-[#1f1f1f] rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* Cards container */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide py-1 px-1 -mx-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {notes.map((note, index) => (
          <StickyNoteCard
            key={note.id}
            note={note}
            colorIndex={index}
            onClick={() => onNoteClick?.(note.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default NotesCarousel;
