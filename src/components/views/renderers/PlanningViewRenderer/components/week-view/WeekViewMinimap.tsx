"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { format, isToday } from 'date-fns';

interface WeekViewMinimapProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  days: Date[];
}

export function WeekViewMinimap({ scrollContainerRef, days }: WeekViewMinimapProps) {
  const [scrollState, setScrollState] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [isDragging, setIsDragging] = useState(false);
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
  const thumbLeft = canScroll ? (scrollLeft / (scrollWidth - clientWidth)) * (100 - thumbWidth) : 0;

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

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const scrollRatio = deltaX / trackRect.width;
      const maxScroll = container.scrollWidth - container.clientWidth;
      container.scrollLeft = startScrollLeft + scrollRatio * maxScroll;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
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
      <div className="bg-[#18181b] border border-[#3f3f46] rounded-lg shadow-xl p-2 w-48">
        {/* Header */}
        <div className="text-[9px] text-[#71717a] uppercase tracking-wider mb-1.5 px-1">
          ← Scroll →
        </div>
        
        {/* Track */}
        <div 
          ref={trackRef}
          onClick={handleTrackClick}
          className="h-8 bg-[#09090b] rounded relative cursor-pointer overflow-hidden border border-[#27272a]"
        >
          {/* Mini day indicators */}
          <div className="absolute inset-0 flex">
            {days.map((day, i) => {
              const isTodayDay = isToday(day);
              return (
                <div 
                  key={i}
                  className={cn(
                    "flex-1 border-r border-[#27272a] last:border-r-0 flex items-center justify-center",
                    isTodayDay && "bg-blue-500/20"
                  )}
                >
                  <span className={cn(
                    "text-[8px] font-medium",
                    isTodayDay ? "text-blue-400" : "text-[#52525b]"
                  )}>
                    {format(day, 'E')[0]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Viewport indicator (draggable thumb) */}
          <div
            onMouseDown={handleMouseDown}
            className={cn(
              "absolute top-0 h-full rounded cursor-grab active:cursor-grabbing transition-colors border-2",
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

        {/* Day labels below */}
        <div className="flex mt-1 px-0.5">
          {days.map((day, i) => {
            const isTodayDay = isToday(day);
            return (
              <div key={i} className="flex-1 text-center">
                <span className={cn(
                  "text-[7px]",
                  isTodayDay ? "text-blue-400 font-medium" : "text-[#52525b]"
                )}>
                  {format(day, 'd')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

