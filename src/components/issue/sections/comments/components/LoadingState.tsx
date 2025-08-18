"use client";

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
    </div>
  );
}
