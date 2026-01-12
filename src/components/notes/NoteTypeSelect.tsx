"use client";

import { NoteType } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNoteTypeOptions, getNoteTypeConfig } from "@/lib/note-types";
import { cn } from "@/lib/utils";

interface NoteTypeSelectProps {
  value: NoteType;
  onChange: (value: NoteType) => void;
  disabled?: boolean;
  className?: string;
  showDescription?: boolean;
}

export function NoteTypeSelect({
  value,
  onChange,
  disabled = false,
  className,
  showDescription = false,
}: NoteTypeSelectProps) {
  const options = getNoteTypeOptions();
  const selectedConfig = getNoteTypeConfig(value);
  const Icon = selectedConfig.icon;

  return (
    <Select
      value={value}
      onValueChange={(val) => onChange(val as NoteType)}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-[180px]", className)}>
        <SelectValue>
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", selectedConfig.color)} />
            <span>{selectedConfig.label}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const OptionIcon = option.icon;
          return (
            <SelectItem
              key={option.value}
              value={option.value}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className={cn("p-1 rounded", option.bgColor)}>
                  <OptionIcon className={cn("h-3.5 w-3.5", option.color)} />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">{option.label}</span>
                  {showDescription && (
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// Compact version for inline use
export function NoteTypeChip({
  type,
  className,
}: {
  type: NoteType;
  className?: string;
}) {
  const config = getNoteTypeConfig(type);
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
        config.bgColor,
        config.color,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </div>
  );
}
