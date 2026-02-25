"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus, Flag } from "lucide-react";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";

interface PrioritySelectorProps {
  value: string[];
  onChange: (priorities: string[]) => void;
  disabled?: boolean;
}

// Priority configuration matching issue detail selector
const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", icon: ArrowDown, color: "text-slate-500", suffix: "P4" },
  { value: "MEDIUM", label: "Medium", icon: Minus, color: "text-blue-600", suffix: "P3" },
  { value: "HIGH", label: "High", icon: ArrowUp, color: "text-amber-600", suffix: "P2" },
  { value: "URGENT", label: "Urgent", icon: Flag, color: "text-red-600", suffix: "P1" },
];

export function PrioritySelector({
  value = [],
  onChange,
  disabled = false,
}: PrioritySelectorProps) {
  // Convert to FilterOption format
  const options: FilterOption[] = useMemo(() => {
    return PRIORITY_OPTIONS.map(priority => ({
      id: priority.value,
      label: priority.label,
      icon: priority.icon,
      iconColor: priority.color,
      suffix: priority.suffix,
    }));
  }, []);

  return (
    <GlobalFilterSelector
      value={value}
      onChange={onChange as (value: string | string[]) => void}
      options={options}
      label="Priority"
      pluralLabel="priorities"
      emptyIcon={Minus}
      selectionMode="multi"
      showSearch={false}
      allowClear={true}
      disabled={disabled}
      popoverWidth="w-56"
      filterHeader="Filter by priority"
    />
  );
}
