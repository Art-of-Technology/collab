"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { UserX, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { GlobalFilterSelector, FilterOption } from "@/components/ui/GlobalFilterSelector";
import { cn } from "@/lib/utils";

interface AssigneeSelectorProps {
  value: string[];
  onChange: (assignees: string[]) => void;
  disabled?: boolean;
  assignees?: Array<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
    useCustomAvatar?: boolean;
  }>;
}

export function AssigneeSelector({
  value = [],
  onChange,
  disabled = false,
  assignees = [],
}: AssigneeSelectorProps) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  // Convert to FilterOption format with prioritization
  const options: FilterOption[] = useMemo(() => {
    return assignees.map(assignee => ({
      id: assignee.id,
      label: assignee.name,
      image: assignee.image,
      useCustomAvatar: assignee.useCustomAvatar,
      isPrioritized: assignee.id === currentUserId,
      priorityLabel: assignee.id === currentUserId ? "(You)" : undefined,
    }));
  }, [assignees, currentUserId]);

  // Get selected assignees for custom rendering
  const selectedAssignees = useMemo(() => {
    return assignees.filter(a => value.includes(a.id));
  }, [assignees, value]);

  // Custom trigger content for avatars
  const renderTriggerContent = (selectedOptions: FilterOption[]) => {
    if (selectedAssignees.length === 0) {
      return (
        <>
          <UserX className="h-3 w-3 text-[#6e7681]" />
          <span className="text-[#6e7681] text-xs">Assignee</span>
        </>
      );
    }

    if (selectedAssignees.length === 1) {
      const assignee = selectedAssignees[0];
      return (
        <>
          {assignee.useCustomAvatar ? (
            <CustomAvatar user={assignee} size="sm" />
          ) : (
            <Avatar className="h-3.5 w-3.5">
              {assignee.image && <AvatarImage src={assignee.image} alt={assignee.name} />}
              <AvatarFallback className="text-xs font-medium">
                {assignee.name?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{assignee.name}</span>
        </>
      );
    }

    // Multiple assignees
    return (
      <>
        <div className="flex items-center -space-x-1">
          {selectedAssignees.slice(0, 3).map((assignee, index) => (
            <div key={assignee.id} className="relative" style={{ zIndex: 3 - index }}>
              {assignee.useCustomAvatar ? (
                <CustomAvatar user={assignee} size="sm" className="border border-[#181818]" />
              ) : (
                <Avatar className="h-3.5 w-3.5 border border-[#181818]">
                  {assignee.image && <AvatarImage src={assignee.image} alt={assignee.name} />}
                  <AvatarFallback className="text-xs font-medium bg-[#2a2a2a] text-white">
                    {assignee.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {selectedAssignees.length > 3 && (
            <div className="h-3.5 w-3.5 rounded-full bg-[#404040] border border-[#181818] flex items-center justify-center">
              <span className="text-[8px] text-white font-medium">+</span>
            </div>
          )}
        </div>
        <span className="text-[#cccccc] text-xs">{selectedAssignees.length} assignees</span>
      </>
    );
  };

  // Custom option content for avatars
  const renderOptionContent = (option: FilterOption, isSelected: boolean) => {
    const assignee = assignees.find(a => a.id === option.id);
    if (!assignee) return null;

    return (
      <>
        {assignee.useCustomAvatar ? (
          <CustomAvatar user={assignee} size="sm" />
        ) : (
          <Avatar className="h-5 w-5">
            {assignee.image && <AvatarImage src={assignee.image} alt={assignee.name} />}
            <AvatarFallback className="text-xs font-medium">
              {assignee.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
        )}
        <span className={cn("text-[#cccccc] flex-1", option.isPrioritized && "font-medium")}>
          {assignee.name}
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
      label="Assignee"
      pluralLabel="assignees"
      emptyIcon={UserX}
      selectionMode="multi"
      showSearch={true}
      searchPlaceholder="Search people..."
      allowClear={true}
      disabled={disabled}
      popoverWidth="w-72"
      filterHeader="Filter by assignees"
      sectionHeader="Team members"
      renderTriggerContent={renderTriggerContent}
      renderOptionContent={renderOptionContent}
    />
  );
}
