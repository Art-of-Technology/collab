"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getIssuePriorityBadge, PRIORITY_CONFIG } from "@/utils/issueHelpers";
import type { IssuePriority, IssueSelectorProps } from "@/types/issue";

interface IssuePrioritySelectorProps extends Omit<IssueSelectorProps, 'value' | 'onChange'> {
  value: IssuePriority;
  onChange: (priority: IssuePriority) => void;
}

const PRIORITY_OPTIONS: IssuePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function IssuePrioritySelector({
  value,
  onChange,
  disabled = false,
  readonly = false,
  placeholder = "Select priority"
}: IssuePrioritySelectorProps) {
  // Helper function to render badge
  const renderBadge = (badgeConfig: { label: string; icon: any; className: string; iconClassName: string }) => {
    const Icon = badgeConfig.icon;
    return (
      <Badge variant="outline" className={badgeConfig.className}>
        <Icon className={badgeConfig.iconClassName} />
        {badgeConfig.label}
      </Badge>
    );
  };

  // If readonly, just return the same styling as the button but non-interactive
  if (readonly) {
    const badge = getIssuePriorityBadge(value);
    const Icon = badge.icon;
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
          "border border-[#2d2d30] bg-[#181818]",
          "text-[#cccccc]"
        )}
      >
        <Icon className={cn("h-3 w-3", badge.iconClassName)} />
        <span className="text-[#cccccc] text-xs">{badge.label}</span>
      </div>
    );
  }

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || readonly}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            (disabled || readonly) && "opacity-50 cursor-not-allowed"
          )}
        >
          {(() => {
            const badge = getIssuePriorityBadge(value);
            const Icon = badge.icon;
            return (
              <>
                <Icon className={cn("h-3 w-3", badge.iconClassName)} />
                <span className="text-[#cccccc] text-xs">{badge.label}</span>
              </>
            );
          })()}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-56 p-1 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] mb-1 font-medium">
          Set priority
        </div>
        
        <div className="space-y-0.5">
          {PRIORITY_OPTIONS.map((priority) => {
            const badge = getIssuePriorityBadge(priority);
            const Icon = badge.icon;

            return (
              <Button
                key={priority}
                type="button"
                variant="ghost"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                onClick={() => onChange(priority)}
              >
                <Icon className={cn("h-3.5 w-3.5", badge.iconClassName)} />
                <span className="text-[#cccccc] flex-1">{badge.label}</span>
                <span className="text-xs text-[#6e7681]">
                  {priority === 'LOW' && 'P4'}
                  {priority === 'MEDIUM' && 'P3'}
                  {priority === 'HIGH' && 'P2'}
                  {priority === 'URGENT' && 'P1'}
                </span>
                {value === priority && (
                  <span className="text-xs text-[#6e7681]">✓</span>
                )}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
} 