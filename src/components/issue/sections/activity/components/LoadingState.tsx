"use client";

export function LoadingState() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-2.5 py-1.5 px-1 animate-pulse">
          <div className="h-6 w-6 bg-[#1a1a1a] rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-[#1a1a1a] rounded w-3/4" />
            <div className="h-2 bg-[#1a1a1a] rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
