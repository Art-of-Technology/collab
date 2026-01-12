"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { UserX, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";
import { cn } from "@/lib/utils";

interface ReporterSelectorProps {
  value: string[];
  onChange: (reporters: string[]) => void;
  disabled?: boolean;
  reporters?: Array<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
    useCustomAvatar?: boolean;
  }>;
}

export function ReporterSelector({
  value = [],
  onChange,
  disabled = false,
  reporters = [],
}: ReporterSelectorProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  // Convert to FilterOption format with prioritization
  const options: FilterOption[] = useMemo(() => {
    return reporters.map(reporter => ({
      id: reporter.id,
      label: reporter.name,
      image: reporter.image,
      useCustomAvatar: reporter.useCustomAvatar,
      isPrioritized: reporter.id === currentUserId,
      priorityLabel: reporter.id === currentUserId ? "(You)" : undefined,
    }));
  }, [reporters, currentUserId]);

  // Get selected reporters for custom rendering
  const selectedReporters = useMemo(() => {
    return reporters.filter(r => value.includes(r.id));
  }, [reporters, value]);

  // Custom trigger content for avatars
  const renderTriggerContent = (selectedOptions: FilterOption[]) => {
    if (selectedReporters.length === 0) {
      return (
        <>
          <UserX className="h-3 w-3 text-[#6e7681]" />
          <span className="text-[#6e7681] text-xs">Reporter</span>
        </>
      );
    }

    if (selectedReporters.length === 1) {
      const reporter = selectedReporters[0];
      return (
        <>
          {reporter.useCustomAvatar ? (
            <CustomAvatar user={reporter} size="sm" />
          ) : (
            <Avatar className="h-3.5 w-3.5">
              {reporter.image && <AvatarImage src={reporter.image} alt={reporter.name || "User Avatar"} />}
              <AvatarFallback className="text-xs font-medium">
                {reporter.name?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{reporter.name}</span>
        </>
      );
    }

    // Multiple reporters
    return (
      <>
        <div className="flex items-center -space-x-1">
          {selectedReporters.slice(0, 3).map((reporter, index) => (
            <div key={reporter.id} className="relative" style={{ zIndex: 3 - index }}>
              {reporter.useCustomAvatar ? (
                <CustomAvatar user={reporter} size="sm" className="border border-[#181818]" />
              ) : (
                <Avatar className="h-3.5 w-3.5 border border-[#181818]">
                  {reporter.image && <AvatarImage src={reporter.image} alt={reporter.name} />}
                  <AvatarFallback className="text-xs font-medium bg-[#2a2a2a] text-white">
                    {reporter.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {selectedReporters.length > 3 && (
            <div className="h-3.5 w-3.5 rounded-full bg-[#404040] border border-[#181818] flex items-center justify-center">
              <span className="text-[8px] text-white font-medium">+</span>
            </div>
          )}
        </div>
        <span className="text-[#cccccc] text-xs">{selectedReporters.length} reporters</span>
      </>
    );
  };

  // Custom option content for avatars
  const renderOptionContent = (option: FilterOption, isSelected: boolean) => {
    const reporter = reporters.find(r => r.id === option.id);
    if (!reporter) return null;

    return (
      <>
        {reporter.useCustomAvatar ? (
          <CustomAvatar user={reporter} size="sm" />
        ) : (
          <Avatar className="h-5 w-5">
            {reporter.image && <AvatarImage src={reporter.image} alt={reporter.name || "User Avatar"} />}
            <AvatarFallback className="text-xs font-medium">
              {reporter.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
        )}
        <span className={cn("text-[#cccccc] flex-1", option.isPrioritized && "font-medium")}>
          {reporter.name}
          {option.isPrioritized ? " (You)" : ""}
        </span>
        {isSelected && <Check className="h-3 w-3 text-[#6e7681]" />}
      </>
    );
  };

  return (
    <GlobalFilterSelector
      value={value}
      onChange={onChange as (value: string | string[]) => void}
      options={options}
      label="Reporter"
      pluralLabel="reporters"
      emptyIcon={UserX}
      selectionMode="multi"
      showSearch={true}
      searchPlaceholder="Search people..."
      allowClear={true}
      disabled={disabled}
      popoverWidth="w-72"
      filterHeader="Filter by reporters"
      sectionHeader="Team members"
      renderTriggerContent={renderTriggerContent}
      renderOptionContent={renderOptionContent}
    />
  );
}
