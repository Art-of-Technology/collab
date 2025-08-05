"use client";

import { forwardRef, useState, useEffect, useRef } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { AtSign, Hash, Users, Calendar, Target, BookOpen, CheckIcon } from 'lucide-react';
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
    const [selectedIndex, setSelectedIndex] = useState(-1); // Start with no selection
    const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
    const commandRef = useRef<HTMLDivElement>(null);
    
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
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!commands.length) return;

        // Arrow keys for navigation
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => {
            // If no item is selected (-1), start from 0
            if (prev === -1) return 0;
            // Otherwise move to next item
            return prev < commands.length - 1 ? prev + 1 : prev;
          });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => {
            // If no item is selected (-1), start from last item
            if (prev === -1) return commands.length - 1;
            // Otherwise move to previous item
            return prev > 0 ? prev - 1 : prev;
          });
        } else if (e.key === "Enter" && selectedIndex >= 0 && commands[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(commands[selectedIndex]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onEscape?.();
        }
      };

      // Add event listener to document with capture phase
      document.addEventListener("keydown", handleKeyDown, true);
      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [commands, commands.length, selectedIndex, onSelect, onEscape]);

    // Scroll selected item into view
    useEffect(() => {
      if (commandRef.current && commands.length > 0 && isKeyboardNavigation) {
        const selectedElement = commandRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [selectedIndex, commands.length, isKeyboardNavigation]);

    // Handle mouse enter to disable keyboard navigation styling
    const handleMouseEnter = (index: number) => {
      setIsKeyboardNavigation(false);
      setSelectedIndex(index);
    };

    return (
      <div ref={ref} className="z-50 overflow-hidden rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 bg-popover">
        <Command ref={commandRef} className="w-[300px]" shouldFilter={false}>
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            Quick actions
          </div>
          <CommandList className="max-h-[200px] overflow-y-auto">
            <CommandGroup>
              {commands.map((command, index) => {
                const IconComponent = command.icon;
                return (
                  <div
                    key={command.id}
                    data-index={index}
                    onClick={() => onSelect(command)}
                    onMouseEnter={() => handleMouseEnter(index)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 cursor-pointer rounded-sm",
                      // Our own hover and selected states
                      !isKeyboardNavigation && "hover:bg-accent/50",
                      isKeyboardNavigation && selectedIndex === index && "bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <IconComponent className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{command.label}</div>
                        <div className="text-xs text-muted-foreground">{command.description}</div>
                      </div>
                    </div>
                    {isKeyboardNavigation && selectedIndex === index && (
                      <CheckIcon className="h-4 w-4 text-primary" />
                    )}
                  </div>
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