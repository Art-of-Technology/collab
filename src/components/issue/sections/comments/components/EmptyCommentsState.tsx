"use client";

import { MessageSquare } from "lucide-react";

export function EmptyCommentsState() {
  return (
    <div className="text-center py-6">
      <MessageSquare className="h-6 w-6 mx-auto mb-2 text-[#444]" />
      <p className="text-[#c9d1d9] text-xs mb-1">No comments yet</p>
      <p className="text-[#7d8590] text-[10px]">Start the conversation</p>
    </div>
  );
}
