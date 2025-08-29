"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar, ChevronDown, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay, isValid, parseISO } from "date-fns";

interface ViewUpdatedAtSelectorProps {
  value: string[];
  onChange: (filters: string[]) => void;
  disabled?: boolean;
}

interface DateRangeFilter {
  id: string;
  label: string;
  type: 'preset' | 'range';
  value?: string;
  startDate?: Date;
  endDate?: Date;
}

const PRESET_OPTIONS: DateRangeFilter[] = [
  {
    id: 'today',
    label: 'Updated today',
    type: 'preset',
    value: 'today'
  },
  {
    id: 'yesterday',
    label: 'Updated yesterday',
    type: 'preset',
    value: 'yesterday'
  },
  {
    id: 'last-3-days',
    label: 'Last 3 days',
    type: 'preset',
    value: 'last-3-days'
  },
  {
    id: 'last-7-days',
    label: 'Last 7 days',
    type: 'preset',
    value: 'last-7-days'
  },
  {
    id: 'last-30-days',
    label: 'Last 30 days',
    type: 'preset',
    value: 'last-30-days'
  }
];

function getDateRangeForPreset(preset: string): { start: Date; end: Date } {
  const today = new Date();
  const startOfToday = startOfDay(today);
  const endOfToday = endOfDay(today);

  switch (preset) {
    case 'today':
      return { start: startOfToday, end: endOfToday };
    case 'yesterday':
      const yesterday = subDays(today, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    case 'last-3-days':
      return { start: startOfDay(subDays(today, 3)), end: endOfToday };
    case 'last-7-days':
      return { start: startOfDay(subDays(today, 7)), end: endOfToday };
    case 'last-30-days':
      return { start: startOfDay(subDays(today, 30)), end: endOfToday };
    default:
      return { start: startOfToday, end: endOfToday };
  }
}

function parseFilterValue(filterValue: string): DateRangeFilter | null {
  try {
    // Try to parse as preset first
    const preset = PRESET_OPTIONS.find(p => p.value === filterValue);
    if (preset) {
      const { start, end } = getDateRangeForPreset(filterValue);
      return { ...preset, startDate: start, endDate: end };
    }

    // Try to parse as date range (format: "YYYY-MM-DD:YYYY-MM-DD")
    if (filterValue.includes(':')) {
      const [startStr, endStr] = filterValue.split(':');
      const startDate = parseISO(startStr);
      const endDate = parseISO(endStr);
      
      if (isValid(startDate) && isValid(endDate)) {
        return {
          id: `range-${filterValue}`,
          label: `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`,
          type: 'range',
          value: filterValue,
          startDate: startOfDay(startDate),
          endDate: endOfDay(endDate)
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function ViewUpdatedAtSelector({
  value,
  onChange,
  disabled = false,
}: ViewUpdatedAtSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [showCustomRange, setShowCustomRange] = useState(false);

  const activeFilters = value.map(parseFilterValue).filter(Boolean) as DateRangeFilter[];

  const getDisplayText = () => {
    if (activeFilters.length === 0) {
      return "Updated";
    }
    if (activeFilters.length === 1) {
      return activeFilters[0].label;
    }
    return `${activeFilters.length} time ranges`;
  };

  const toggleFilter = (filter: DateRangeFilter) => {
    if (!filter.value) return;
    
    const isSelected = value.includes(filter.value);
    if (isSelected) {
      onChange(value.filter(v => v !== filter.value));
    } else {
      onChange([...value, filter.value]);
    }
  };

  const removeFilter = (filterValue: string) => {
    onChange(value.filter(v => v !== filterValue));
  };

  const addCustomRange = () => {
    if (!customStartDate || !customEndDate) return;
    
    try {
      const startDate = parseISO(customStartDate);
      const endDate = parseISO(customEndDate);
      
      if (!isValid(startDate) || !isValid(endDate)) return;
      if (startDate > endDate) return;
      
      const rangeValue = `${customStartDate}:${customEndDate}`;
      if (!value.includes(rangeValue)) {
        onChange([...value, rangeValue]);
      }
      
      // Reset form
      setCustomStartDate("");
      setCustomEndDate("");
      setShowCustomRange(false);
    } catch {
      // Invalid date input
    }
  };

  const clearAllFilters = () => {
    onChange([]);
  };

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed",
            activeFilters.length > 0 && "border-[#22c55e]/30 bg-[#22c55e]/5"
          )}
        >
          <Calendar className={cn(
            "h-3 w-3",
            activeFilters.length > 0 ? "text-[#22c55e]" : "text-[#6b7280]"
          )} />
          <span className="text-[#cccccc] text-xs">{getDisplayText()}</span>
          <ChevronDown className="h-3 w-3 text-[#6e7681]" />
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-1 bg-[#1c1c1e] border-[#333] shadow-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#333] mb-1">
          <span className="text-xs text-[#9ca3af]">Updated at</span>
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-[#6e7681] hover:text-[#e6edf3]"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div className="px-2 py-1 mb-2">
            <div className="text-xs text-[#9ca3af] mb-2">Active filters:</div>
            <div className="flex flex-wrap gap-1">
              {activeFilters.map((filter) => (
                <div
                  key={filter.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#22c55e]/20 border border-[#22c55e]/30 rounded text-xs"
                >
                  <span className="text-[#22c55e]">updated:</span>
                  <span className="text-[#e6edf3]">{filter.label}</span>
                  <button
                    type="button"
                    onClick={() => removeFilter(filter.value!)}
                    className="text-[#6e7681] hover:text-[#f85149]"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {/* Preset options */}
          <div>
            <div className="text-xs font-medium text-[#e6edf3] px-2 py-1">
              Quick filters
            </div>
            <div className="space-y-0.5">
              {PRESET_OPTIONS.map((option) => {
                const isSelected = value.includes(option.value!);
                
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left"
                    onClick={() => toggleFilter(option)}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {isSelected && <Check className="h-3 w-3 text-[#22c55e]" />}
                    </div>
                    <span className="text-[#e6edf3] text-xs">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom date range */}
          <div>
            <div className="text-xs font-medium text-[#e6edf3] px-2 py-1">
              Custom range
            </div>
            
            {!showCustomRange ? (
              <button
                type="button"
                onClick={() => setShowCustomRange(true)}
                className="w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md hover:bg-[#2a2a2a] transition-colors text-left"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <Plus className="h-3 w-3 text-[#6b7280]" />
                </div>
                <span className="text-[#6b7280] text-xs">Add custom date range</span>
              </button>
            ) : (
              <div className="px-2 py-2 space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-[#9ca3af]">From</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-[#0e0e0e] border border-[#333] rounded text-[#e6edf3] focus:border-[#22c55e] focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#9ca3af]">To</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-[#0e0e0e] border border-[#333] rounded text-[#e6edf3] focus:border-[#22c55e] focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addCustomRange}
                    disabled={!customStartDate || !customEndDate}
                    className="px-2 py-1 text-xs bg-[#22c55e] text-white rounded hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomRange(false);
                      setCustomStartDate("");
                      setCustomEndDate("");
                    }}
                    className="px-2 py-1 text-xs text-[#6e7681] hover:text-[#e6edf3]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
