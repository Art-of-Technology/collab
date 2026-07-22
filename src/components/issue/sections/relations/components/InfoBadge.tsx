"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface InfoBadgeProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function InfoBadge({ children, className, style }: InfoBadgeProps) {
  return (
    <Badge
      className={cn(
        "h-5 px-2 text-[10px] font-medium leading-tight border border-collab-600 rounded bg-collab-800 text-collab-400 flex items-center gap-1 hover:bg-opacity-50 transition-all",
        className
      )}
      style={style}
    >
      {children}
    </Badge>
  );
}
