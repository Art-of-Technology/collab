"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn(
        "w-full border-border/50 bg-background/50",
        "hover:border-border/80 hover:bg-background/80",
        "focus:border-primary/50 focus:bg-background",
        "transition-all duration-200"
      )}>
        <SelectValue placeholder={placeholder}>
          {value && renderBadge(getIssuePriorityBadge(value))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[160px]">
        {PRIORITY_OPTIONS.map((priority) => {
          const config = PRIORITY_CONFIG[priority];
          return (
            <SelectItem
              key={priority}
              value={priority}
              className="py-2.5"
            >
              <div className="flex items-center gap-2 w-full">
                {renderBadge(getIssuePriorityBadge(priority))}
                <span className="text-xs text-muted-foreground ml-auto">
                  {priority === 'LOW' && 'P4'}
                  {priority === 'MEDIUM' && 'P3'}
                  {priority === 'HIGH' && 'P2'}
                  {priority === 'URGENT' && 'P1'}
                </span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
} 