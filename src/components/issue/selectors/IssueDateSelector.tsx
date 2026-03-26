"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon, ChevronLeft } from "lucide-react";
import { format, addDays, nextMonday, addWeeks, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { IssueSelectorProps } from "@/types/issue";

interface IssueDateSelectorProps extends Omit<IssueSelectorProps, 'value' | 'onChange'> {
  value?: Date;
  onChange: (date: Date | undefined) => void;
}

// Preset date options
const getPresetDates = () => {
  const today = startOfDay(new Date());
  return [
    {
      label: "Tomorrow",
      date: addDays(today, 1),
      description: format(addDays(today, 1), "EEE, d MMM")
    },
    {
      label: "End of this week",
      date: addDays(today, 7 - today.getDay()),
      description: format(addDays(today, 7 - today.getDay()), "EEE, d MMM")
    },
    {
      label: "In one week",
      date: addWeeks(today, 1),
      description: format(addWeeks(today, 1), "EEE, d MMM")
    }
  ];
};

export function IssueDateSelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Set date"
}: IssueDateSelectorProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  const presetDates = getPresetDates();

  const handlePresetSelect = (date: Date) => {
    onChange(date);
    setIsOpen(false);
    setShowCalendar(false);
  };

  const handleCustomClick = () => {
    setShowCalendar(true);
  };

  const handleBackToPresets = () => {
    setShowCalendar(false);
  };

  const handleDateSelect = (date: Date | undefined) => {
    onChange(date);
    setIsOpen(false);
    setShowCalendar(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setShowCalendar(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange} modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-collab-600 hover:border-collab-600 hover:bg-collab-800",
            "text-collab-400 focus:outline-none bg-collab-800",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <CalendarIcon className="h-3 w-3 text-collab-500" />
          {value ? (
            <span className="text-collab-400 text-xs">{format(value, "MMM d")}</span>
          ) : (
            <span className="text-collab-500 text-xs">Due date</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-0 bg-collab-800 border-collab-600 shadow-xl" 
        align="start"
        side="bottom"
        sideOffset={4}
      >
        {!showCalendar ? (
          // Preset dates view
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-collab-400 border-b border-collab-600 mb-2">
              <span>Try: 24h, 7 days, Feb 9</span>
            </div>
            
            {presetDates.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                onClick={() => handlePresetSelect(preset.date)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-collab-400 hover:bg-collab-600 rounded transition-colors"
              >
                <span>{preset.label}</span>
                <span className="text-collab-400">{preset.description}</span>
              </Button>
            ))}

            <Button
              variant="ghost"
              onClick={handleCustomClick}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-collab-400 hover:bg-collab-600 rounded transition-colors"
            >
              <span>Custom...</span>
            </Button>
          </div>
        ) : (
          // Calendar view
          <div className="bg-collab-800">
            {/* Header with back button */}
            <div className="flex items-center gap-2 p-3 border-b border-collab-600">
              <Button
                variant="ghost"
                onClick={handleBackToPresets}
                className="p-1 hover:bg-collab-600 rounded transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-collab-400" />
              </Button>
              <span className="text-sm font-medium text-collab-400">Choose a date</span>
            </div>
            
            {/* Calendar */}
            <div className="p-3 bg-collab-800">
              <Calendar
                mode="single"
                selected={value}
                onSelect={handleDateSelect}
                initialFocus
                className="w-full bg-collab-800"
                classNames={{
                  months: "flex flex-col space-y-4 w-full",
                  month: "space-y-4 w-full",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium text-collab-400",
                  nav: "space-x-1 flex items-center",
                  nav_button_previous: "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                  nav_button_next: "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                  table: "w-full border-collapse space-y-1 mt-4",
                  head_row: "flex w-full",
                  head_cell: "text-collab-400 rounded-md w-9 font-normal text-xs",
                  row: "flex w-full mt-1",
                  cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                  day: "h-9 w-9 p-0 font-normal text-collab-400 hover:bg-collab-600 hover:text-white rounded-md transition-colors focus:outline-none focus:bg-collab-600 focus:text-white",
                  day_selected: "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
                  day_today: "bg-collab-600 text-white",
                  day_outside: "text-collab-400 opacity-50",
                  day_disabled: "text-collab-400 opacity-30",
                  day_hidden: "invisible",
                }}
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
} 