"use client";

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Eye,
  User,
  Globe,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  ViewTypeSelector,
  ViewProjectSelector,
  ViewGroupingSelector,
  ViewDisplayPropertiesSelector,
  StatusSelector,
  PrioritySelector,
  TypeSelector,
  AssigneeSelector,
  LabelsSelector,
  ViewUpdatedAtSelector,
  ReporterSelector
} from '@/components/views/selectors';
import { ActionFiltersSelector, type ActionFilter } from '@/components/views/selectors/ActionFiltersSelector';
import { useCreateView } from '@/hooks/queries/useViews';
import Image from 'next/image';

interface CreateViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  projects?: Array<{
    id: string;
    name: string;
    color?: string;
  }>;
  onViewCreated?: (view: any) => void;
}

export default function CreateViewModal({
  isOpen,
  onClose,
  workspaceId,
  projects = [],
  onViewCreated
}: CreateViewModalProps) {
  const { workspaces } = useWorkspace();
  const initialProjectIds = projects.map(p => p.id);
  // Fetch workspace members for assignee selector
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const members = await response.json();

      // Transform the data to extract user objects from members
      return members.map((member: any) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
        useCustomAvatar: member.user.useCustomAvatar,
        avatarAccessory: member.user.avatarAccessory,
        avatarBrows: member.user.avatarBrows,
        avatarEyes: member.user.avatarEyes,
        avatarEyewear: member.user.avatarEyewear,
        avatarHair: member.user.avatarHair,
        avatarMouth: member.user.avatarMouth,
        avatarNose: member.user.avatarNose,
        avatarSkinTone: member.user.avatarSkinTone,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch workspace labels for labels selector
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace-labels', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/labels`);
      if (!response.ok) {
        throw new Error('Failed to fetch labels');
      }
      const data = await response.json();
      return data.labels || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    displayType: 'LIST',
    targetWorkspaceId: workspaceId,
    visibility: 'WORKSPACE',
    projectIds: projects.map(p => p.id),
    grouping: 'none',
    ordering: 'manual',
    displayProperties: ['Priority', 'Status', 'Assignee'],
    filters: {
      status: [] as string[],
      priority: [] as string[],
      type: [] as string[],
      assignee: [] as string[],
      reporter: [] as string[],
      labels: [] as string[],
      updatedAt: [] as string[],
      actions: [] as ActionFilter[]
    }
  });
  const { toast } = useToast();
  const createViewMutation = useCreateView();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'View name is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      const viewData = {
        name: formData.name,
        description: formData.description,
        displayType: formData.displayType,
        visibility: formData.visibility as 'PERSONAL' | 'WORKSPACE' | 'SHARED',
        projectIds: formData.projectIds,
        filters: formData.filters,
        sorting: { field: 'manual', direction: 'asc' },
        grouping: { field: formData.grouping },
        fields: formData.displayProperties,
        layout: {
          showSubtasks: true,
          showLabels: true,
          showAssigneeAvatars: true
        }
      };

      const result = await createViewMutation.mutateAsync({
        workspaceId: formData.targetWorkspaceId,
        viewData
      });
      
      toast({
        title: 'Success',
        description: 'View created successfully'
      });
      
      onViewCreated?.(result.view);
      onClose();
      
    } catch (error) {
      console.error('Error creating view:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create view',
        variant: 'destructive'
      });
    }
  };

  const handleDisplayTypeChange = (newType: string) => {
    const newDisplayProperties = (() => {
      switch (newType) {
        case 'LIST': return ['Priority', 'Status', 'Assignee'];
        case 'KANBAN': return ['Assignee', 'Priority', 'Labels'];
        default: return ['Priority', 'Status', 'Assignee'];
      }
    })();

    const newGrouping = newType === 'KANBAN' ? 'status' : 'none';
    const newOrdering = 'manual';

    setFormData(prev => ({
      ...prev,
      displayType: newType,
      displayProperties: newDisplayProperties,
      grouping: newGrouping,
      ordering: newOrdering
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Create view</DialogTitle>
        </DialogHeader>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-purple-500 flex items-center justify-center">
              <Eye className="h-2.5 w-2.5 text-white" />
            </div>
            <span className="text-[#9ca3af] text-sm">Create view</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6e7681]">Save to</span>
            <Select
              value={formData.visibility === 'PERSONAL' ? 'PERSONAL' : formData.targetWorkspaceId} 
              onValueChange={(value) => {
                if (value === 'PERSONAL') {
                  setFormData(prev => ({ 
                    ...prev, 
                    visibility: 'PERSONAL',
                    targetWorkspaceId: workspaceId 
                  }));
                } else {
                  setFormData(prev => ({ 
                    ...prev, 
                    visibility: 'WORKSPACE',
                    targetWorkspaceId: value 
                  }));
                }
              }}
            >
              <SelectTrigger className="h-6 w-auto min-w-[80px] bg-[#238636] border-[#238636] text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0e0e0e] border-[#1a1a1a]">
                <SelectItem value="PERSONAL" className="text-white focus:bg-[#1a1a1a] text-xs">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    Personal
                  </div>
                </SelectItem>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id} className="text-white focus:bg-[#1a1a1a] text-xs">
                    <div className="flex items-center gap-1.5">
                      {workspace.logoUrl ? (
                        <Image src={workspace.logoUrl} alt="" className="h-3 w-3 rounded" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      {workspace.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={onClose}
              className="text-[#6e7681] hover:text-white transition-colors p-1 rounded-md hover:bg-[#1a1a1a]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          {/* View Name Input - Matches NewIssueModal exactly */}
          <input
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="View name"
            className="w-full text-xl font-medium text-white bg-transparent border-none outline-none placeholder-[#6e7681] focus:ring-0 focus:border-none focus:outline-none resize-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 mb-3"
            disabled={createViewMutation.isPending}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          {/* Description Input - Matches IssueDescriptionEditor styling */}
          <div className="relative cursor-text mb-4">
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Add description..."
              className="w-full min-h-[80px] text-[#e6edf3] bg-transparent border-none outline-none resize-none leading-relaxed focus:ring-0 focus-visible:outline-none placeholder-[#6e7681]"
              disabled={createViewMutation.isPending}
              rows={3}
            />
          </div>

          {/* Properties - Badge Selectors like NewIssueModal */}
          <div className="flex flex-wrap gap-1 mt-2 mb-6">
            <ViewTypeSelector
              value={formData.displayType as "LIST" | "KANBAN"}
              onChange={handleDisplayTypeChange}
            />
            <ViewProjectSelector
              value={formData.projectIds}
              onChange={(projectIds) => setFormData(prev => ({ ...prev, projectIds }))}
              projects={projects}
            />
            <ViewGroupingSelector
              value={formData.grouping}
              onChange={(grouping) => setFormData(prev => ({ ...prev, grouping }))}
              displayType={formData.displayType}
            />
            <ViewDisplayPropertiesSelector
              value={formData.displayProperties}
              onChange={(properties) => setFormData(prev => ({ ...prev, displayProperties: properties }))}
            />
            <StatusSelector
              value={formData.filters.status}
              onChange={(status) => setFormData(prev => ({ ...prev, filters: { ...prev.filters, status } }))}
              projectIds={formData.projectIds.length > 0 ? formData.projectIds : initialProjectIds}
            />
            <PrioritySelector
              value={formData.filters.priority}
              onChange={(priority) => {
                setFormData(prev => ({ ...prev, filters: { ...prev.filters, priority } }));
              }}
            />
            <TypeSelector
              value={formData.filters.type}
              onChange={(type) => {
                setFormData(prev => ({ ...prev, filters: { ...prev.filters, type } }));
              }}
            />
            <AssigneeSelector
              value={formData.filters.assignee}
              onChange={(assignee) => {
                setFormData(prev => ({ ...prev, filters: { ...prev.filters, assignee } }));
              }}
              assignees={workspaceMembers}
            />
            <ReporterSelector
              value={formData.filters.reporter}
              onChange={(reporter) => {
                setFormData(prev => ({ ...prev, filters: { ...prev.filters, reporter } }));
              }}
              reporters={workspaceMembers}
            />
            <LabelsSelector
              value={formData.filters.labels}
              onChange={(labels) => {
                setFormData(prev => ({ ...prev, filters: { ...prev.filters, labels } }));
              }}
              labels={workspaceLabels}
            />
            <ViewUpdatedAtSelector
              value={formData.filters.updatedAt}
              onChange={(updatedAt) => setFormData(prev => ({ ...prev, filters: { ...prev.filters, updatedAt } }))}
            />
            <ActionFiltersSelector
              value={formData.filters.actions}
              onChange={(actions: ActionFilter[]) => setFormData(prev => ({ ...prev, filters: { ...prev.filters, actions } }))}
              projectIds={formData.projectIds.length > 0 ? formData.projectIds : initialProjectIds}
              workspaceMembers={workspaceMembers}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1a1a1a]">
            <div className="flex items-center gap-3 text-xs text-[#6e7681]">
              <kbd className="px-1.5 py-0.5 bg-[#1a1a1a] border border-[#30363d] rounded">⌘</kbd>
              <kbd className="px-1.5 py-0.5 bg-[#1a1a1a] border border-[#30363d] rounded">↵</kbd>
              <span>to create</span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={onClose}
                className="text-[#6e7681] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createViewMutation.isPending || !formData.name.trim()}
                className="bg-[#238636] hover:bg-[#2ea043] text-white border-0 h-8 px-3 text-sm font-medium disabled:opacity-50"
              >
                {createViewMutation.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create view'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
