"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar, Plus, History } from "lucide-react";
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
      return "Updated at";
    }
    
    const presetFilter = activeFilters.find(f => f.type === 'preset');
    const customFilters = activeFilters.filter(f => f.type === 'range');
    
    if (presetFilter && customFilters.length === 0) {
      // Only preset filter
      return presetFilter.label;
    } else if (!presetFilter && customFilters.length === 1) {
      // Only one custom range
      return customFilters[0].label;
    } else if (!presetFilter && customFilters.length > 1) {
      // Only multiple custom ranges
      return `${customFilters.length} custom ranges`;
    } else if (presetFilter && customFilters.length === 1) {
      // One preset + one custom
      return `${presetFilter.label} + 1 custom`;
    } else if (presetFilter && customFilters.length > 1) {
      // One preset + multiple custom
      return `${presetFilter.label} + ${customFilters.length} custom`;
    }
    
    return `${activeFilters.length} date ranges`;
  };

  const toggleFilter = (filter: DateRangeFilter) => {
    if (!filter.value) return;
    
    const isSelected = value.includes(filter.value);
    
    if (filter.type === 'preset') {
      // For preset options, use radio button behavior (only one can be selected)
      if (isSelected) {
        // Deselect current preset
        onChange(value.filter(v => !PRESET_OPTIONS.some(preset => preset.value === v)));
      } else {
        // Remove any other preset options and add this one
        const withoutPresets = value.filter(v => !PRESET_OPTIONS.some(preset => preset.value === v));
        onChange([...withoutPresets, filter.value]);
      }
    } else {
      // For custom ranges, use checkbox behavior (multiple can be selected)
      if (isSelected) {
        onChange(value.filter(v => v !== filter.value));
      } else {
        onChange([...value, filter.value]);
      }
    }
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
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {activeFilters.length === 0 ? (
            <>
              <Calendar className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Updated at</span>
            </>
          ) : activeFilters.length === 1 ? (
            <>
              <Calendar className="h-3 w-3 text-green-500" />
              <span className="text-[#cccccc] text-xs">{getDisplayText()}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                <Calendar className="h-2.5 w-2.5 text-green-500" />
                {activeFilters.length > 1 && (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#404040] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{getDisplayText()}</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-1 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] mb-1 font-medium">
          Filter by updated date
        </div>

        <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent space-y-0.5">
          {/* Clear all option */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
            onClick={() => onChange([])}
          >
            <History className="h-3.5 w-3.5 text-[#6e7681]" />
            <span className="text-[#9ca3af] flex-1">Clear date filter</span>
            {activeFilters.length === 0 && (
              <span className="text-xs text-[#6e7681]">✓</span>
            )}
          </button>
          {/* Preset options */}
          {PRESET_OPTIONS.map((option) => {
            const isSelected = value.includes(option.value!);
            
            return (
              <button
                key={option.id}
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                onClick={() => toggleFilter(option)}
              >
                <Calendar className="h-3.5 w-3.5 text-green-500" />
                <span className="text-[#cccccc] flex-1">{option.label}</span>
                {isSelected && (
                  <span className="text-xs text-[#6e7681]">✓</span>
                )}
              </button>
            );
          })}

          {/* Active custom date ranges */}
          {activeFilters.filter(filter => filter.type === 'range').length > 0 && (
            <>
              <div className="border-t border-[#2d2d30] my-1"></div>
              {activeFilters
                .filter(filter => filter.type === 'range')
                .map((customFilter) => (
                  <button
                    key={customFilter.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                    onClick={() => {
                      // Remove the custom range when clicked
                      onChange(value.filter(v => v !== customFilter.value));
                    }}
                  >
                    <Calendar className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-[#cccccc] flex-1">{customFilter.label}</span>
                    <span className="text-xs text-[#6e7681]">✓</span>
                  </button>
                ))}
            </>
          )}

          {/* Custom date range */}
          {!showCustomRange ? (
            <>
              {(PRESET_OPTIONS.some(option => value.includes(option.value!)) || 
                activeFilters.filter(filter => filter.type === 'range').length > 0) && (
                <div className="border-t border-[#2d2d30] my-1"></div>
              )}
              <button
                type="button"
                onClick={() => setShowCustomRange(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
              >
                <Plus className="h-3.5 w-3.5 text-[#6e7681]" />
                <span className="text-[#9ca3af] flex-1">Add custom date range</span>
              </button>
            </>
          ) : (
            <div className="px-2 py-2 space-y-2 border-t border-[#2d2d30]">
              <div className="text-[10px] text-[#6e7681] px-0 py-1 uppercase tracking-wide">
                Custom range
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[#9ca3af]">From</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-[#0e0e0e] border border-[#2d2d30] rounded text-[#cccccc] focus:border-[#22c55e] focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[#9ca3af]">To</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-[#0e0e0e] border border-[#2d2d30] rounded text-[#cccccc] focus:border-[#22c55e] focus:outline-none"
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
                  className="px-2 py-1 text-xs text-[#6e7681] hover:text-[#cccccc]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
