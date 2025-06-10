"use client";

import { Loader2 } from "lucide-react";

export function GlobalLoading() {
  return (
    <div className="fixed inset-0 bg-[#191919] z-[9999] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse" />
        </div>
        <div className="text-center space-y-3">
          <h3 className="text-xl font-semibold text-foreground">Loading Workspace</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Setting up your workspace environment...
          </p>
        </div>
      </div>
    </div>
  );
} 