"use client";

import { useMemo } from "react";
import { Target, BookOpen, CheckSquare, Bug, Milestone, ChevronDown } from "lucide-react";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";

interface TypeSelectorProps {
  value: string[];
  onChange: (types: string[]) => void;
  disabled?: boolean;
}

// Type configuration matching issue detail selector
const TYPE_OPTIONS = [
  { value: "TASK", label: "Task", icon: CheckSquare, color: "text-emerald-600" },
  { value: "STORY", label: "Story", icon: BookOpen, color: "text-blue-600" },
  { value: "EPIC", label: "Epic", icon: Target, color: "text-purple-600" },
  { value: "BUG", label: "Bug", icon: Bug, color: "text-red-600" },
  { value: "MILESTONE", label: "Milestone", icon: Milestone, color: "text-amber-600" },
  { value: "SUBTASK", label: "Subtask", icon: ChevronDown, color: "text-slate-600" },
];

export function TypeSelector({
  value = [],
  onChange,
  disabled = false,
}: TypeSelectorProps) {
  // Convert to FilterOption format
  const options: FilterOption[] = useMemo(() => {
    return TYPE_OPTIONS.map(type => ({
      id: type.value,
      label: type.label,
      icon: type.icon,
      iconColor: type.color,
    }));
  }, []);

  return (
    <GlobalFilterSelector
      value={value}
      onChange={onChange as (value: string | string[]) => void}
      options={options}
      label="Type"
      pluralLabel="types"
      emptyIcon={CheckSquare}
      selectionMode="multi"
      showSearch={false}
      allowClear={true}
      disabled={disabled}
      popoverWidth="w-56"
      filterHeader="Filter by type"
    />
  );
}
