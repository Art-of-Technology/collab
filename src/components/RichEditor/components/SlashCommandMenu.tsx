import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SlashCommand } from '../extensions/slash-commands-extension';

interface SlashCommandMenuProps {
  isVisible: boolean;
  position: { top: number; left: number };
  commands: SlashCommand[];
  selectedIndex: number;
  onCommandSelect: (command: SlashCommand) => void;
}

export function SlashCommandMenu({
  isVisible,
  position,
  commands,
  selectedIndex,
  onCommandSelect,
}: SlashCommandMenuProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to selected item
  useEffect(() => {
    if (!isVisible || !scrollContainerRef.current || !selectedItemRef.current) return;
    
    const container = scrollContainerRef.current;
    const selectedItem = selectedItemRef.current;
    
    const containerRect = container.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();
    
    const itemTop = itemRect.top - containerRect.top + container.scrollTop;
    const itemBottom = itemTop + itemRect.height;
    
    if (itemTop < container.scrollTop) {
      // Item is above visible area, scroll up
      container.scrollTop = itemTop;
    } else if (itemBottom > container.scrollTop + container.clientHeight) {
      // Item is below visible area, scroll down
      container.scrollTop = itemBottom - container.clientHeight;
    }
  }, [selectedIndex, isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-[9997] w-72 bg-collab-800 border border-collab-600 rounded-md shadow-lg overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="text-xs text-gray-400 px-3 py-2 border-b border-collab-600 bg-collab-900">
        Blocks
      </div>
      
      <div ref={scrollContainerRef} className="max-h-64 overflow-y-auto">
        {commands.length > 0 ? (
          commands.map((command, index) => {
            const Icon = command.icon;
            const isSelected = index === selectedIndex;
            return (
              <Button
                key={command.id}
                ref={isSelected ? selectedItemRef : null}
                type="button"
                variant="ghost"
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors h-auto justify-start",
                  isSelected
                    ? "bg-collab-600"
                    : "hover:bg-collab-800"
                )}
                onClick={() => onCommandSelect(command)}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-collab-600 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-collab-50">
                    {command.label}
                  </div>
                  <div className="text-xs text-collab-500 truncate">
                    {command.description}
                  </div>
                </div>
              </Button>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-collab-500 text-sm">
            No matching blocks
          </div>
        )}
      </div>
    </div>
  );
}
