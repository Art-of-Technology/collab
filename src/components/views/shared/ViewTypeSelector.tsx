"use client";

import { Button } from '@/components/ui/button';
import { Grid, List, BarChart3, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const VIEW_TYPES = [
  { id: 'LIST', name: 'List', icon: List },
  { id: 'KANBAN', name: 'Board', icon: Grid },
  { id: 'TIMELINE', name: 'Timeline', icon: BarChart3 },
  { id: 'PLANNING', name: 'Planning', icon: Calendar },
];

interface ViewTypeSelectorProps {
  selectedType: string;
  onTypeChange: (type: string) => void;
  variant?: 'modal' | 'toolbar' | 'buttons';
  availableTypes?: string[];
}

export default function ViewTypeSelector({
  selectedType,
  onTypeChange,
  variant = 'toolbar',
  availableTypes = ['LIST', 'KANBAN']
}: ViewTypeSelectorProps) {
  const filteredTypes = VIEW_TYPES.filter(type => availableTypes.includes(type.id));

  if (variant === 'modal') {
    return (
      <div className="flex gap-2 mb-6">
        {filteredTypes.map((type) => {
          const Icon = type.icon;
          const isSelected = selectedType === type.id;
          
          return (
            <Button
              key={type.id}
              variant="ghost"
              onClick={() => onTypeChange(type.id)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors flex-1",
                isSelected
                  ? "border-[#0969da] bg-[#0969da]/10"
                  : "border-[#2a2a2a] hover:border-[#444]"
              )}
            >
              <Icon className="h-5 w-5 text-[#999]" />
              <span className="text-sm text-white">{type.name}</span>
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center border border-[#2a2a2a] rounded">
      {filteredTypes.map((type, index) => {
        const Icon = type.icon;
        const isSelected = selectedType === type.id;
        const isFirst = index === 0;
        const isLast = index === filteredTypes.length - 1;
        
        return (
          <Button
            key={type.id}
            variant="ghost"
            size="sm"
            onClick={() => onTypeChange(type.id)}
            className={cn(
              "h-8 px-3 rounded-none border-r border-[#2a2a2a]",
              isFirst && "rounded-l",
              isLast && "rounded-r border-r-0",
              isSelected 
                ? "bg-[#1f1f1f] text-white" 
                : "text-[#666] hover:text-white hover:bg-[#1a1a1a]"
            )}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
} 