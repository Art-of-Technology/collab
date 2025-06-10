"use client";

import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Loader2 } from "lucide-react";
import { ProjectHierarchyView } from "@/components/tasks/ProjectHierarchyView";

export default function ProjectHierarchyBoard() {
  const { currentWorkspace } = useWorkspace();
  const { isLoading: permissionsLoading } = useWorkspacePermissions();
  
  if (!currentWorkspace) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (permissionsLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectHierarchyView />
    </div>
  );
} 