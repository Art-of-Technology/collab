"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface KanbanMinimapColumn {
  id: string;
  name: string;
  issues: any[];
}

interface KanbanMinimapProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  columns: KanbanMinimapColumn[];
}

export function KanbanMinimap({ scrollContainerRef, columns }: KanbanMinimapProps) {
  const [scrollState, setScrollState] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragThumbLeft, setDragThumbLeft] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Update scroll state
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      setScrollState({
        scrollLeft: container.scrollLeft,
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
      });
    };

    updateScrollState();
    container.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [scrollContainerRef]);

  // Calculate thumb position and size
  const { scrollLeft, scrollWidth, clientWidth } = scrollState;
  const canScroll = scrollWidth > clientWidth;
  const thumbWidth = canScroll ? Math.max((clientWidth / scrollWidth) * 100, 15) : 100;
  const calculatedThumbLeft = canScroll ? (scrollLeft / (scrollWidth - clientWidth)) * (100 - thumbWidth) : 0;
  
  // Use drag position when dragging, otherwise use calculated position
  const thumbLeft = dragThumbLeft !== null ? dragThumbLeft : calculatedThumbLeft;

  // Get max issue count for relative sizing
  const maxIssueCount = Math.max(1, ...columns.map(c => c.issues.length));

  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const track = trackRef.current;
    const container = scrollContainerRef.current;
    if (!track || !container) return;

    const trackRect = track.getBoundingClientRect();
    const startX = e.clientX;
    const startScrollLeft = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    const currentThumbWidth = Math.max((container.clientWidth / container.scrollWidth) * 100, 15);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const scrollRatio = deltaX / trackRect.width;
      const newScrollLeft = Math.max(0, Math.min(maxScroll, startScrollLeft + scrollRatio * maxScroll));
      
      // Update container scroll
      container.scrollLeft = newScrollLeft;
      
      // Calculate and set thumb position directly
      const newThumbLeft = maxScroll > 0 
        ? (newScrollLeft / maxScroll) * (100 - currentThumbWidth)
        : 0;
      setDragThumbLeft(newThumbLeft);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragThumbLeft(null); // Clear drag position, let scroll state take over
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [scrollContainerRef]);

  // Handle track click
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current;
    const container = scrollContainerRef.current;
    if (!track || !container) return;

    const trackRect = track.getBoundingClientRect();
    const clickX = e.clientX - trackRect.left;
    const clickRatio = clickX / trackRect.width;
    const maxScroll = container.scrollWidth - container.clientWidth;
    container.scrollTo({ left: clickRatio * maxScroll, behavior: 'smooth' });
  }, [scrollContainerRef]);

  if (!canScroll) return null;

  return (
    <div 
      className={cn(
        "fixed bottom-4 right-4 z-50 transition-all duration-200",
        isHovered || isDragging ? "opacity-100" : "opacity-70 hover:opacity-100"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Minimap container */}
      <div className="bg-[#18181b] border border-[#3f3f46] rounded-lg shadow-xl p-2 min-w-[180px]">
        {/* Header */}
        <div className="text-[9px] text-[#71717a] uppercase tracking-wider mb-1.5 px-1">
          ← Scroll →
        </div>
        
        {/* Track */}
        <div 
          ref={trackRef}
          onClick={handleTrackClick}
          className="h-10 bg-[#09090b] rounded relative cursor-pointer overflow-hidden border border-[#27272a]"
        >
          {/* Mini column indicators with issue bars */}
          <div className="absolute inset-0 flex">
            {columns.map((column) => {
              const issueRatio = column.issues.length / maxIssueCount;
              const barHeight = Math.max(4, Math.round(issueRatio * 24));
              return (
                <div 
                  key={column.id}
                  className="flex-1 border-r border-[#27272a] last:border-r-0 flex flex-col items-center justify-end pb-1"
                >
                  {/* Issue count bar */}
                  <div 
                    className="w-2 bg-[#3f3f46] rounded-sm transition-all"
                    style={{ height: `${barHeight}px` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Viewport indicator (draggable thumb) */}
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              "absolute top-0 h-full rounded cursor-grab active:cursor-grabbing border-2",
              isDragging 
                ? "bg-blue-500/40 border-blue-400" 
                : "bg-white/20 border-white/40 hover:bg-white/30 hover:border-white/50"
            )}
            style={{
              left: `${thumbLeft}%`,
              width: `${thumbWidth}%`,
            }}
          />
        </div>

        {/* Column labels below */}
        <div className="flex mt-1 px-0.5 gap-0.5">
          {columns.map((column) => (
            <div key={column.id} className="flex-1 text-center min-w-0">
              <span className="text-[7px] text-[#52525b] truncate block" title={column.name}>
                {column.name.slice(0, 3)}
              </span>
            </div>
          ))}
        </div>

        {/* Issue counts row */}
        <div className="flex px-0.5 gap-0.5">
          {columns.map((column) => (
            <div key={column.id} className="flex-1 text-center min-w-0">
              <span className="text-[8px] text-[#71717a] font-medium">
                {column.issues.length}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
