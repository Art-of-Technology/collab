"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUserWorkspaces } from "@/hooks/queries/useWorkspace";
import { cn } from "@/lib/utils";
import {
  AtSign,
  Briefcase,
  CheckSquare,
  Inbox,
  Users
} from "lucide-react";

interface NotificationsSidebarProps {
  selectedFilters: string[];
  selectedWorkspace: string;
  onFilterChange: (filterId: string, checked: boolean) => void;
  onWorkspaceChange: (workspaceId: string) => void;
  workspaceId: string;
}

interface FilterCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  active?: boolean;
}

const filterCategories: FilterCategory[] = [
  {
    id: "inbox",
    label: "Inbox",
    icon: <Inbox className="h-4 w-4" />,
    active: true,
  },
  {
    id: "mentioned",
    label: "Mentioned",
    icon: <AtSign className="h-4 w-4" />,
  },
  {
    id: "task-related",
    label: "Task notifications",
    icon: <CheckSquare className="h-4 w-4" />,
  },
  {
    id: "board-related",
    label: "Board notifications", 
    icon: <Briefcase className="h-4 w-4" />,
  },
  {
    id: "team-mentions",
    label: "Team mentions",
    icon: <Users className="h-4 w-4" />,
  },
];

export default function NotificationsSidebar({
  selectedFilters,
  selectedWorkspace,
  onFilterChange,
  onWorkspaceChange,
}: NotificationsSidebarProps) {
  const { data: workspaces = { all: [] } } = useUserWorkspaces();
  const hasMultipleWorkspaces = workspaces.all.length > 1;

  return (
    <div className="h-full overflow-y-auto">
      {/* Main Navigation */}
      <div className="p-4 space-y-1">
        {filterCategories.map((category) => {
          const isSelected = selectedFilters.includes(category.id);
          
          return (
            <Button
              key={category.id}
              variant={isSelected ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "w-full justify-start gap-3 h-8 px-3 text-sm font-normal",
                isSelected && "bg-muted"
              )}
              onClick={() => onFilterChange(category.id, !isSelected)}
            >
              {category.icon}
              <span className="flex-1 text-left">{category.label}</span>
              {category.count && (
                <Badge variant="outline" className="h-4 px-1.5 text-xs ml-auto">
                  {category.count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      
      {hasMultipleWorkspaces && (
        <>
          <Separator className="mx-4" />
          
          {/* Workspaces */}
          <div className="p-4">
            <div className="text-sm font-medium text-muted-foreground mb-2">Workspaces</div>
            <div className="space-y-1">
              {workspaces.all.slice(0, 5).map((workspace: any) => (
                <Button
                  key={workspace.id}
                  variant={selectedWorkspace === workspace.id ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "w-full justify-start gap-3 h-7 px-3 text-sm font-normal",
                    selectedWorkspace === workspace.id && "bg-muted"
                  )}
                  onClick={() => onWorkspaceChange(workspace.id)}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: workspace.color || '#6366f1' }}
                  />
                  <span className="flex-1 text-left truncate">{workspace.name}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-xs ml-auto">
                    2
                  </Badge>
                </Button>
              ))}
              {workspaces.all.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 px-3 text-sm font-normal text-muted-foreground"
                >
                  View all workspaces
                </Button>
              )}
            </div>
          </div>
        </>
      )}


      
      {/* Manage notifications */}
      <div className="p-4 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-7 px-3 text-sm font-normal text-muted-foreground"
        >
          Manage notifications
        </Button>
      </div>
    </div>
  );
}