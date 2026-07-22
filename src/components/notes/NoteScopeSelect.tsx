"use client";

import { NoteScope } from "@prisma/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNoteScopeOptions, getNoteScopeConfig } from "@/lib/note-types";
import { cn } from "@/lib/utils";

interface NoteScopeSelectProps {
  value: NoteScope;
  onChange: (value: NoteScope) => void;
  disabled?: boolean;
  className?: string;
  showDescription?: boolean;
  // Option to filter available scopes
  availableScopes?: NoteScope[];
  // Whether to require a project for PROJECT scope
  requireProject?: boolean;
  hasProject?: boolean;
}

export function NoteScopeSelect({
  value,
  onChange,
  disabled = false,
  className,
  showDescription = false,
  availableScopes,
  requireProject = true,
  hasProject = false,
}: NoteScopeSelectProps) {
  const allOptions = getNoteScopeOptions();
  const options = availableScopes
    ? allOptions.filter((opt) => availableScopes.includes(opt.value))
    : allOptions;

  const selectedConfig = getNoteScopeConfig(value);
  const Icon = selectedConfig.icon;

  return (
    <Select
      value={value}
      onValueChange={(val) => onChange(val as NoteScope)}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-[160px]", className)}>
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
          const isDisabled =
            requireProject &&
            option.value === NoteScope.PROJECT &&
            !hasProject;

          return (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={isDisabled}
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
                  {isDisabled && (
                    <span className="text-xs text-orange-500">
                      Select a project first
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
export function NoteScopeChip({
  scope,
  className,
}: {
  scope: NoteScope;
  className?: string;
}) {
  const config = getNoteScopeConfig(scope);
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
