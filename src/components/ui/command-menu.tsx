"use client";

import { forwardRef } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { AtSign, Hash, Users, Calendar, Target, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandOption {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

interface CommandMenuProps {
  onSelect: (option: CommandOption) => void;
  onEscape?: () => void;
}

export const CommandMenu = forwardRef<HTMLDivElement, CommandMenuProps>(
  ({ onSelect, onEscape }, ref) => {
    const commands: CommandOption[] = [
      {
        id: 'mention-user',
        label: 'Mention user',
        description: 'Mention a team member',
        icon: AtSign,
        action: () => {}
      },
      {
        id: 'mention-task',
        label: 'Mention task',
        description: 'Reference a task',
        icon: Hash,
        action: () => {}
      },
      {
        id: 'mention-epic',
        label: 'Mention epic',
        description: 'Reference an epic',
        icon: Target,
        action: () => {}
      },
      {
        id: 'mention-story',
        label: 'Mention story',
        description: 'Reference a story',
        icon: BookOpen,
        action: () => {}
      },
      {
        id: 'mention-milestone',
        label: 'Mention milestone',
        description: 'Reference a milestone',
        icon: Calendar,
        action: () => {}
      }
    ];

    // Handle keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onEscape?.();
      }
    };

    return (
      <div ref={ref} className="z-50 overflow-hidden rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 bg-popover">
        <Command className="w-[300px]" shouldFilter={false}>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            Quick actions
          </div>
          <CommandList className="max-h-[200px] overflow-y-auto">
            <CommandGroup>
              {commands.map((command) => {
                const IconComponent = command.icon;
                return (
                  <CommandItem
                    key={command.id}
                    onSelect={() => onSelect(command)}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent"
                  >
                    <IconComponent className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{command.label}</div>
                      <div className="text-xs text-muted-foreground">{command.description}</div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          <div className="px-3 py-2 text-xs text-muted-foreground border-t">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  ↵
                </kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  esc
                </kbd>
                close
              </span>
            </div>
          </div>
        </Command>
      </div>
    );
  }
);

CommandMenu.displayName = "CommandMenu"; 