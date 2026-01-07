"use client";

import { useState, useMemo, useEffect } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ViewProjectSelector } from '@/components/views/selectors/ViewProjectSelector';
import { AssigneeSelector } from '@/components/views/selectors/AssigneeSelector';
import { useProjects } from '@/hooks/queries/useProjects';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { TeamDashboard } from '@/components/planning';

interface PlanningViewRendererV2Props {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
}

export default function PlanningViewRendererV2({
  view,
  issues,
  workspace,
  currentUser,
}: PlanningViewRendererV2Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Fetch all workspace projects
  const { data: allProjects = [] } = useProjects({
    workspaceId: workspace.id,
    includeStats: false,
  });

  // Fetch all workspace members
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', workspace.id],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspace.id}/members`);
      if (!response.ok) throw new Error('Failed to fetch members');
      const members = await response.json();
      return members.map((member: any) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
      }));
    },
  });

  // Transform projects for selector
  const workspaceProjects = useMemo(() => {
    return allProjects.map((p: any) => ({
      id: p.id,
      name: p.name,
      color: p.color,
    }));
  }, [allProjects]);

  // Filter states
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    view.projects?.map((p: any) => p.id) || []
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    view.filters?.assignee || []
  );

  // Initialize with all projects when available
  useEffect(() => {
    if (workspaceProjects.length > 0 && selectedProjectIds.length === 0) {
      setSelectedProjectIds(workspaceProjects.map(p => p.id));
    }
  }, [workspaceProjects, selectedProjectIds.length]);

  // Track filter changes
  const hasChanges = useMemo(() => {
    const savedProjectIds = view.projects?.map((p: any) => p.id) || [];
    const savedAssigneeIds = view.filters?.assignee || [];

    return (
      JSON.stringify(selectedProjectIds.sort()) !== JSON.stringify(savedProjectIds.sort()) ||
      JSON.stringify(selectedUserIds.sort()) !== JSON.stringify(savedAssigneeIds.sort())
    );
  }, [selectedProjectIds, selectedUserIds, view.projects, view.filters]);

  // User IDs for filtering - use selected users or all if none selected
  const userIdsToFetch = selectedUserIds.length > 0 ? selectedUserIds : undefined;

  // Save filter changes
  const handleSaveChanges = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views/${view.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: selectedProjectIds,
          filters: {
            ...view.filters,
            assignee: selectedUserIds,
          },
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'View filters saved successfully'
        });
        queryClient.invalidateQueries({ queryKey: ['views', workspace.id] });
        router.refresh();
      } else {
        throw new Error('Failed to save changes');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save view filters',
        variant: 'destructive'
      });
    }
  };

  const handleResetChanges = () => {
    setSelectedProjectIds(view.projects?.map((p: any) => p.id) || []);
    setSelectedUserIds(view.filters?.assignee || []);
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      {/* Toolbar - Compact filter bar */}
      <div className="border-b border-[#1f1f23] bg-[#0c0c0d] px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Left - Filters */}
          <div className="flex items-center gap-2">
            <ViewProjectSelector
              value={selectedProjectIds}
              onChange={setSelectedProjectIds}
              projects={workspaceProjects}
            />
            <AssigneeSelector
              value={selectedUserIds}
              onChange={setSelectedUserIds}
              assignees={workspaceMembers}
            />
          </div>

          {/* Right - Save/Reset buttons */}
          {hasChanges && !view.isDefault && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetChanges}
                className="h-7 px-2 text-xs text-[#71717a] hover:text-white"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSaveChanges}
                className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700"
              >
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <TeamDashboard
        workspaceId={workspace.id}
        workspaceSlug={workspace.slug}
        projectIds={selectedProjectIds.length > 0 ? selectedProjectIds : undefined}
        userIds={userIdsToFetch}
      />
    </div>
  );
}
