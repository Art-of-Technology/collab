"use client";

import { Clock } from "lucide-react";

export function EmptyActivityState() {
  return (
    <div className="text-center py-8">
      <Clock className="h-12 w-12 mx-auto mb-4 text-collab-600" />
      <p className="text-collab-400 text-sm">No activity recorded yet</p>
      <p className="text-collab-500 text-xs mt-1">Activity will appear here as changes are made</p>
    </div>
  );
}
