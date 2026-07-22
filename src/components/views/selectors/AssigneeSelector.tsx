"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { UserX, Check } from "lucide-react";
import { UserAvatar } from '@/components/ui/user-avatar';
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
          <UserX className="h-3 w-3 text-collab-500" />
          <span className="text-collab-500 text-xs">Assignee</span>
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
            <UserAvatar user={assignee} size="xs" />
          )}
          <span className="text-collab-400 text-xs truncate max-w-[80px]">{assignee.name}</span>
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
                <CustomAvatar user={assignee} size="sm" className="border border-collab-700" />
              ) : (
                <UserAvatar user={assignee} size="xs" className="border border-collab-700" />
              )}
            </div>
          ))}
          {selectedAssignees.length > 3 && (
            <div className="h-3.5 w-3.5 rounded-full bg-collab-600 border border-collab-700 flex items-center justify-center">
              <span className="text-[8px] text-white font-medium">+</span>
            </div>
          )}
        </div>
        <span className="text-collab-400 text-xs">{selectedAssignees.length} assignees</span>
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
          <UserAvatar user={assignee} size="sm" />
        )}
        <span className={cn("text-collab-400 flex-1", option.isPrioritized && "font-medium")}>
          {assignee.name}
          {option.isPrioritized ? " (You)" : ""}
        </span>
        {isSelected && <Check className="h-3 w-3 text-collab-500" />}
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
