"use client";

import { useMemo } from "react";
import { Circle, CheckCircle2, XCircle, Timer, Archive, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getProjectStatuses } from "@/actions/status";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";
import { cn } from "@/lib/utils";

interface StatusSelectorProps {
  value: string[];
  projectIds: string[];
  onChange: (statuses: string[]) => void;
  disabled?: boolean;
}

// Icon mapping for status icons
const iconMap = {
  'circle': Circle,
  'archive': Archive,
  'check-circle-2': CheckCircle2,
  'timer': Timer,
  'x-circle': XCircle,
} as const;

export function StatusSelector({
  value = [],
  onChange,
  disabled = false,
  projectIds = [],
}: StatusSelectorProps) {
  const { data: statuses = [], isLoading, isError } = useQuery({
    queryKey: ['statuses', projectIds],
    queryFn: () => getProjectStatuses(projectIds),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: projectIds.length > 0
  });

  if (isError) return null;

  // Create unique statuses map using Name as key to ensure lookup by Name works correctly
  const uniqueStatuses = Array.from(new Map(statuses.map(s => [s.name, s])).values());

  // Convert to FilterOption format
  const options: FilterOption[] = useMemo(() => {
    return uniqueStatuses.map(status => ({
      id: status.name, // Using name as ID for grouping across projects
      label: status.displayName,
      iconColor: status.color,
      // Store original data for custom rendering
      icon: iconMap[status.iconName as keyof typeof iconMap] || Circle,
    }));
  }, [uniqueStatuses]);

  // Custom toggle handler that handles multiple status IDs per name
  const handleChange = (newValue: string | string[]) => {
    const newNames = Array.isArray(newValue) ? newValue : newValue ? [newValue] : [];

    // Get all status IDs for the selected names
    const selectedIds: string[] = [];
    newNames.forEach(name => {
      const matchingIds = statuses
        .filter(s => s.name === name)
        .map(s => s.id);
      selectedIds.push(...matchingIds);
    });

    onChange(selectedIds);
  };

  // Map current value (IDs) back to names for the component
  const selectedNames = useMemo(() => {
    const names = new Set<string>();
    value.forEach(id => {
      const status = statuses.find(s => s.id === id);
      if (status) {
        names.add(status.name);
      }
    });
    return Array.from(names);
  }, [value, statuses]);

  // Get selected statuses for custom trigger rendering
  const selectedStatuses = useMemo(() => {
    return uniqueStatuses.filter(s => selectedNames.includes(s.name));
  }, [uniqueStatuses, selectedNames]);

  // Custom trigger content for status icons
  const renderTriggerContent = () => {
    if (selectedStatuses.length === 0) {
      return (
        <>
          <Circle className="h-3 w-3 text-[#6e7681]" />
          <span className="text-[#6e7681] text-xs">Status</span>
        </>
      );
    }

    if (selectedStatuses.length === 1) {
      const status = selectedStatuses[0];
      const Icon = iconMap[status.iconName as keyof typeof iconMap] || Circle;
      return (
        <>
          <Icon className="h-3 w-3" style={{ color: status.color }} />
          <span className="text-[#cccccc] text-xs">{status.displayName}</span>
        </>
      );
    }

    // Multiple statuses
    return (
      <>
        <div className="flex items-center gap-0.5">
          {selectedStatuses.slice(0, 2).map((status) => {
            const Icon = iconMap[status.iconName as keyof typeof iconMap] || Circle;
            return (
              <Icon
                key={status.name}
                className="h-2.5 w-2.5"
                style={{ color: status.color }}
              />
            );
          })}
          {selectedStatuses.length > 2 && (
            <div className="h-2.5 w-2.5 rounded-full bg-[#404040] flex items-center justify-center">
              <span className="text-[8px] text-white font-medium">+</span>
            </div>
          )}
        </div>
        <span className="text-[#cccccc] text-xs">{selectedStatuses.length} statuses</span>
      </>
    );
  };

  // Custom option content for status icons
  const renderOptionContent = (option: FilterOption, isSelected: boolean) => {
    const status = uniqueStatuses.find(s => s.name === option.id);
    if (!status) return null;

    const Icon = iconMap[status.iconName as keyof typeof iconMap] || Circle;

    return (
      <>
        <Icon className="h-3.5 w-3.5" style={{ color: status.color }} />
        <span className="text-[#cccccc] flex-1">{status.displayName}</span>
        {isSelected && <Check className="h-3 w-3 text-[#6e7681]" />}
      </>
    );
  };

  return (
    <GlobalFilterSelector
      value={selectedNames}
      onChange={handleChange}
      options={options}
      label="Status"
      pluralLabel="statuses"
      emptyIcon={Circle}
      selectionMode="multi"
      showSearch={false}
      allowClear={true}
      disabled={disabled}
      isLoading={isLoading}
      popoverWidth="w-60"
      filterHeader="Filter by status"
      renderTriggerContent={renderTriggerContent}
      renderOptionContent={renderOptionContent}
    />
  );
}
