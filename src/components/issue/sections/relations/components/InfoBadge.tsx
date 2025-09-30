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
        "h-4 px-1.5 text-[9px] font-medium leading-none border border-[#2d2d30] rounded bg-[#181818] text-[#cccccc] flex items-center gap-1 hover:bg-opacity-50 transition-all",
        className
      )}
      style={style}
    >
      {children}
    </Badge>
  );
}
