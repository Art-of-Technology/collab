"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from "next-auth/react";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  X,
  User,
  UserX,
  Globe,
  Lock,
  Trash2,
  Search,
  Check,
  X as XIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceMembers } from '@/hooks/queries/useWorkspaceMembers';
import { useQuery } from '@tanstack/react-query';
import { useProjects } from '@/hooks/queries/useProjects';

export interface ViewFiltersProps {
  issues: any[];
  workspace: any;
  view?: {
    id: string;
    name: string;
    visibility: string;
    createdBy: string;
    owner?: any;
  };
  currentUser: any;
  isOpen: boolean;
  onToggle: () => void;
  selectedFilters: {
    assignees: string[];
    labels: string[];
    priority: string[];
    projects: string[];
  };
  onFiltersChange: (filters: {
    assignees: string[];
    labels: string[];
    priority: string[];
    projects: string[];
  }) => void;
  viewType: 'kanban' | 'list' | 'timeline';
  onVisibilityChange?: (visibility: string) => void;
  onOwnerChange?: (ownerId: string) => void;
  onDeleteView?: () => void;
  onNameChange?: (name: string) => void;
  onAssigneesChangeFromViewOptions?: (assignees: unknown) => void;
}

type FilterTab = 'assignees' | 'labels' | 'priority' | 'projects';

export default function ViewFilters({
  issues,
  workspace,
  view,
  currentUser,
  isOpen,
  onToggle,
  selectedFilters,
  onFiltersChange,
  viewType,
  onVisibilityChange,
  onOwnerChange,
  onDeleteView,
  onNameChange,
  onAssigneesChangeFromViewOptions
}: ViewFiltersProps) {
  const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>('assignees');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(view?.name || '');
  
  // Use TanStack Query for workspace members with caching
  const { data: workspaceMembers = [], isLoading: isLoadingMembers } = useWorkspaceMembers(workspace?.id);

  // Fetch workspace labels
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace-labels', workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const response = await fetch(`/api/workspaces/${workspace.id}/labels`);
      if (!response.ok) {
        throw new Error('Failed to fetch labels');
      }
      const data = await response.json();
      return data.labels || [];
    },
    enabled: !!workspace?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch workspace projects
  const { data: allProjects = [] } = useProjects({
    workspaceId: workspace?.id,
    includeStats: false,
  });

  // Update editedName when view name changes
  useEffect(() => {
    setEditedName(view?.name || '');
  }, [view?.name]);

  // Name editing handlers
  const handleNameSave = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (editedName.trim() && editedName !== view?.name) {
      onNameChange?.(editedName.trim());
    }
    setIsEditingName(false);
  }, [editedName, view?.name, onNameChange]);

  const handleNameDiscard = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    setEditedName(view?.name || '');
    setIsEditingName(false);
  }, [view?.name]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleNameDiscard();
    }
  }, [handleNameSave, handleNameDiscard]);

  // Filter handlers
  const handleFilterToggle = useCallback((filterType: keyof typeof selectedFilters, filterId: string) => {
    const currentFilters = selectedFilters[filterType];
    const isSelected = currentFilters.includes(filterId);
    
    const newFilters = isSelected
      ? { ...selectedFilters, [filterType]: currentFilters.filter(id => id !== filterId) }
      : { ...selectedFilters, [filterType]: [...currentFilters, filterId] };
    
    onFiltersChange(newFilters);
    
    // Update dropdown filter when assignees change from View Options
    if (filterType === 'assignees' && onAssigneesChangeFromViewOptions) {
      const assignees = newFilters.assignees;
      // Ensure assignees is a valid array before calling callback
      if (Array.isArray(assignees)) {
        try {
          onAssigneesChangeFromViewOptions([...assignees]);
        } catch (error) {
          console.warn('Error in onAssigneesChangeFromViewOptions:', error);
        }
      }
    }
  }, [selectedFilters, onFiltersChange, onAssigneesChangeFromViewOptions]);

  const clearAllFilters = useCallback(() => {
    const emptyFilters = {
      assignees: [],
      labels: [],
      priority: [],
      projects: []
    };
    onFiltersChange(emptyFilters);
    
    // Update dropdown filter when clearing assignees
    if (onAssigneesChangeFromViewOptions) {
      try {
        onAssigneesChangeFromViewOptions([]);
      } catch (error) {
        console.warn('Error calling onAssigneesChangeFromViewOptions:', error);
      }
    }
  }, [onFiltersChange, onAssigneesChangeFromViewOptions]);

    // Get filter data with counts - show all options, count from issues
  const filterData = useMemo(() => {
    const assignees = new Map();
    const labels = new Map();
    const priorities = new Map();
    const projects = new Map();
    
    // Initialize all assignees from workspace members
    assignees.set('unassigned', {
      id: 'unassigned',
      name: 'No assignee',
      count: 0,
      avatar: null
    });
    workspaceMembers.forEach((member: any) => {
      assignees.set(member.id, {
        id: member.id,
        name: member.name,
        avatar: member.image,
        count: 0
      });
    });
    
    // Initialize all labels from workspace
    labels.set('no-labels', {
      id: 'no-labels',
      name: 'No labels',
      count: 0,
      color: null
    });
    workspaceLabels.forEach((label: any) => {
      labels.set(label.id, {
        id: label.id,
        name: label.name,
        color: label.color,
        count: 0
      });
    });
    
    // Initialize all priority options
    const priorityOptions = [
      { id: 'URGENT', name: 'Urgent' },
      { id: 'HIGH', name: 'High' },
      { id: 'MEDIUM', name: 'Medium' },
      { id: 'LOW', name: 'Low' },
      { id: 'no-priority', name: 'No priority' }
    ];
    priorityOptions.forEach(priority => {
      priorities.set(priority.id, {
        id: priority.id,
        name: priority.name,
        count: 0
      });
    });
    
    // Initialize all projects from workspace
    projects.set('no-project', {
      id: 'no-project',
      name: 'No project',
      count: 0,
      color: null
    });
    allProjects.forEach((project: any) => {
      projects.set(project.id, {
        id: project.id,
        name: project.name,
        color: project.color,
        count: 0
      });
    });
    
    // Count from issues
    issues.forEach((issue: any) => {
      // Count assignees
      const assigneeId = issue.assigneeId || 'unassigned';
      const assigneeData = assignees.get(assigneeId);
      if (assigneeData) {
        assigneeData.count++;
      }
      
      // Count labels
      if (!issue.labels || issue.labels.length === 0) {
        const noLabelsData = labels.get('no-labels');
        if (noLabelsData) noLabelsData.count++;
      } else {
        issue.labels.forEach((label: any) => {
          const labelData = labels.get(label.id);
          if (labelData) {
            labelData.count++;
          }
        });
      }
      
      // Count priorities
      const priority = issue.priority || 'no-priority';
      const priorityData = priorities.get(priority);
      if (priorityData) {
        priorityData.count++;
      }
      
      // Count projects
      const projectId = issue.project?.id || 'no-project';
      const projectData = projects.get(projectId);
      if (projectData) {
        projectData.count++;
      }
    });
    
    return {
      assignees: Array.from(assignees.values()).sort((a, b) => b.count - a.count),
      labels: Array.from(labels.values()).sort((a, b) => b.count - a.count),
      priorities: Array.from(priorities.values()).sort((a, b) => b.count - a.count),
      projects: Array.from(projects.values()).sort((a, b) => b.count - a.count)
    };
  }, [issues, workspaceMembers, workspaceLabels, allProjects]);

  // Check if any filters are active
  const hasActiveFilters = selectedFilters.assignees.length > 0 || 
                          selectedFilters.labels.length > 0 || 
                          selectedFilters.priority.length > 0 || 
                          selectedFilters.projects.length > 0;

  if (!isOpen) return null;

  return (
    <div className="w-full bg-[#0a0a0a] overflow-hidden flex flex-col h-full">
      {/* Compact Sidebar Header */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">View Options</h3>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onToggle}
            className="h-6 w-6 p-0 text-[#666] hover:text-white"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Editable View Name */}
        <div className="mb-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-[#9ca3af]">Name</div>
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  onBlur={(e) => {
                    // Prevent blur when clicking save/discard buttons
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    if (relatedTarget?.closest('[data-name-action]')) {
                      return;
                    }
                    setTimeout(() => handleNameDiscard(), 0);
                  }}
                  className="h-5 text-xs bg-[#0e0e0e] border-[#2d2d30] focus:border-[#464649] text-[#cccccc] px-2 w-24"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  data-name-action="save"
                  onClick={handleNameSave}
                  disabled={!editedName.trim() || editedName === view?.name}
                  className="h-5 w-5 p-0 text-green-500 hover:text-green-400 hover:bg-green-500/10 disabled:opacity-30 rounded flex items-center justify-center transition-colors"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  data-name-action="discard"
                  onClick={handleNameDiscard}
                  className="h-5 w-5 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded flex items-center justify-center transition-colors"
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEditingName(true)}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
                  "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
                  "text-[#cccccc] focus:outline-none bg-[#181818]"
                )}
              >
                <span className="text-[#cccccc] text-xs truncate max-w-[120px]">{view?.name || 'Unnamed View'}</span>
              </Button>
            )}
          </div>
        </div>
        
        {/* Visibility and Owner Selectors */}
        <div className="space-y-2 mb-3">
          {/* Visibility Selector */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-[#9ca3af]">Visibility</div>
            <Popover modal={true}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
                    "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
                    "text-[#cccccc] focus:outline-none bg-[#181818]"
                  )}
                >
                  {view?.visibility === 'WORKSPACE' ? (
                    <>
                      <Globe className="h-3 w-3 text-[#6e7681]" />
                      <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{workspace?.name || 'Workspace'}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3 text-[#6e7681]" />
                      <span className="text-[#cccccc] text-xs">Personal</span>
                    </>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-56 p-0 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <div className="p-3 border-b border-[#2d2d30]">
                  <div className="text-xs text-[#9ca3af] mb-2 font-medium">
                    Change visibility
                  </div>
                </div>
                
                <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                    onClick={() => onVisibilityChange?.('WORKSPACE')}
                  >
                    <Globe className="h-3 w-3 text-[#6e7681]" />
                    <span className="text-[#cccccc] flex-1">{workspace?.name || 'Workspace'}</span>
                    {view?.visibility === 'WORKSPACE' && (
                      <span className="text-xs text-[#6e7681]">✓</span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                    onClick={() => onVisibilityChange?.('PERSONAL')}
                  >
                    <Lock className="h-3 w-3 text-[#6e7681]" />
                    <span className="text-[#cccccc] flex-1">Personal</span>
                    {view?.visibility === 'PERSONAL' && (
                      <span className="text-xs text-[#6e7681]">✓</span>
                    )}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        
        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAllFilters}
            className="w-full justify-start text-[#999] hover:text-white h-7 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear filters
          </Button>
        )}
      </div>
      
      {/* Compact Filter Tabs */}
      <div className="border-b border-[#1f1f1f]">
        <div className="flex">
          {[
            { id: 'assignees', label: 'Assignees' },
            { id: 'labels', label: 'Labels' },
            { id: 'priority', label: 'Priority' },
            { id: 'projects', label: 'Projects' }
          ].map((tab) => (
            <Button
              key={tab.id}
              variant="ghost"
              onClick={() => setActiveFilterTab(tab.id as FilterTab)}
              className={cn(
                "flex-1 px-2 py-1.5 text-xs font-medium border-b-2 transition-colors",
                activeFilterTab === tab.id
                  ? "text-white border-[#0969da] bg-[#0969da]/10"
                  : "text-[#999] border-transparent hover:text-white hover:bg-[#1f1f1f]"
              )}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
      
      {/* Filter Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Assignees Tab */}
        {activeFilterTab === 'assignees' && (
          <div className="space-y-0.5">
            {filterData.assignees.map((assignee) => (
              <div
                key={assignee.id}
                className={cn(
                  "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors",
                  selectedFilters.assignees.includes(assignee.id)
                    ? "bg-[#0969da]/20 border border-[#0969da]/40"
                    : "hover:bg-[#1f1f1f]"
                )}
                onClick={() => handleFilterToggle('assignees', assignee.id)}
              >
                <div className="flex items-center gap-2">
                  {assignee.id === 'unassigned' ? (
                    <div className="w-5 h-5 rounded-full bg-[#1f1f1f] flex items-center justify-center">
                      <User className="h-3 w-3 text-[#666]" />
                    </div>
                  ) : (
                    <Avatar className="w-5 h-5">
                      <AvatarImage src={assignee.avatar} />
                      <AvatarFallback className="text-xs bg-[#1f1f1f] text-[#999]">
                        {assignee.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="text-xs text-white">{assignee.name}</span>
                </div>
                <Badge variant="secondary" className="bg-[#1f1f1f] text-[#999] border-0 text-xs px-1.5 py-0.5 h-4">
                  {assignee.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
        
        {/* Labels Tab */}
        {activeFilterTab === 'labels' && (
          <div className="space-y-0.5">
            {filterData.labels.map((label) => (
              <div
                key={label.id}
                className={cn(
                  "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors",
                  selectedFilters.labels.includes(label.id)
                    ? "bg-[#0969da]/20 border border-[#0969da]/40"
                    : "hover:bg-[#1f1f1f]"
                )}
                onClick={() => handleFilterToggle('labels', label.id)}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2.5 h-2.5 rounded"
                    style={{ backgroundColor: label.color || '#6b7280' }}
                  />
                  <span className="text-xs text-white">{label.name}</span>
                </div>
                <Badge variant="secondary" className="bg-[#1f1f1f] text-[#999] border-0 text-xs px-1.5 py-0.5 h-4">
                  {label.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
        
        {/* Priority Tab */}
        {activeFilterTab === 'priority' && (
          <div className="space-y-0.5">
            {filterData.priorities.map((priority) => (
              <div
                key={priority.id}
                className={cn(
                  "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors",
                  selectedFilters.priority.includes(priority.id)
                    ? "bg-[#0969da]/20 border border-[#0969da]/40"
                    : "hover:bg-[#1f1f1f]"
                )}
                onClick={() => handleFilterToggle('priority', priority.id)}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full",
                    priority.id === 'URGENT' && "bg-red-500",
                    priority.id === 'HIGH' && "bg-orange-500",
                    priority.id === 'MEDIUM' && "bg-yellow-500",
                    priority.id === 'LOW' && "bg-green-500",
                    priority.id === 'no-priority' && "bg-[#666]"
                  )} />
                  <span className="text-xs text-white">{priority.name}</span>
                </div>
                <Badge variant="secondary" className="bg-[#1f1f1f] text-[#999] border-0 text-xs px-1.5 py-0.5 h-4">
                  {priority.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
        
        {/* Projects Tab */}
        {activeFilterTab === 'projects' && (
          <div className="space-y-0.5">
            {filterData.projects.map((project) => (
              <div
                key={project.id}
                className={cn(
                  "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors",
                  selectedFilters.projects.includes(project.id)
                    ? "bg-[#0969da]/20 border border-[#0969da]/40"
                    : "hover:bg-[#1f1f1f]"
                )}
                onClick={() => handleFilterToggle('projects', project.id)}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2.5 h-2.5 rounded"
                    style={{ backgroundColor: project.color || '#6b7280' }}
                  />
                  <span className="text-xs text-white">{project.name}</span>
                </div>
                <Badge variant="secondary" className="bg-[#1f1f1f] text-[#999] border-0 text-xs px-1.5 py-0.5 h-4">
                  {project.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Compact Display Options Footer */}
      <div className="border-t border-[#1f1f1f] p-3">
        {/* View-specific options */}
        {viewType === 'kanban' && (
          <div className="text-xs text-[#666] text-center">
            Drag & drop to reorganize
          </div>
        )}
        
        {viewType === 'list' && (
          <div className="text-xs text-[#666] text-center">
            Click to view details
          </div>
        )}
        
        {viewType === 'timeline' && (
          <div className="text-xs text-[#666] text-center">
            Timeline view
          </div>
        )}

        {/* Delete View Button - Only show if user is the owner */}
        {view && currentUser && view.createdBy === currentUser.id && onDeleteView && (
          <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteView}
              className="w-full h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete View
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Owner Selector Component - exact copy of IssueAssigneeSelector logic
interface OwnerSelectorProps {
  value?: string;
  onChange?: (ownerId: string) => void;
  workspaceMembers: any[];
  currentOwner?: any;
  isLoading?: boolean;
}

function OwnerSelector({
  value,
  onChange,
  workspaceMembers,
  currentOwner,
  isLoading = false
}: OwnerSelectorProps) {
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState("");

  const selectedUser = workspaceMembers.find(member => member.id === value) || currentOwner;
  const currentUserId = session?.user?.id;

  // Filter users based on search query
  const filteredUsers = workspaceMembers.filter(member =>
    member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate current user from others to prioritize current user
  const currentUser = filteredUsers.find(member => member.id === currentUserId);
  const otherUsers = filteredUsers.filter(member => member.id !== currentUserId);
  
  // Combine: current user first, then others in original order
  const prioritizedUsers = currentUser ? [currentUser, ...otherUsers] : otherUsers;

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]"
          )}
        >
          {selectedUser ? (
            <>
              <Avatar className="h-3.5 w-3.5">
                <AvatarImage src={selectedUser.image} alt={selectedUser.name} />
                <AvatarFallback className="text-xs font-medium">
                  {selectedUser.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{selectedUser.name}</span>
            </>
          ) : (
            <>
              <UserX className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Owner</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-72 p-0 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="p-3 border-b border-[#2d2d30]">
          <div className="text-xs text-[#9ca3af] mb-2 font-medium">
            Change owner
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-7 text-xs bg-[#0e0e0e] border-[#2d2d30] focus:border-[#464649] text-[#cccccc]"
            />
          </div>
        </div>
        
        <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent p-1">
          {isLoading ? (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              Loading members...
            </div>
          ) : (
            <>
              {prioritizedUsers.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-xs text-[#6e7681]">Team members</div>
              )}
              
              {prioritizedUsers.map((member) => (
            <Button
              key={member.id}
              type="button"
              variant="ghost"
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors text-left ${
                member.id === currentUserId
                  ? 'bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30'
                  : 'hover:bg-[#2a2a2a]'
              }`}
              onClick={() => onChange?.(member.id)}
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={member.image} alt={member.name} />
                <AvatarFallback className="text-xs font-medium">
                  {member.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className={`text-[#cccccc] flex-1 ${member.id === currentUserId ? 'font-medium' : ''}`}>
                {member.name}{member.id === currentUserId ? " (You)" : ""}
              </span>
              {value === member.id && (
                <span className="text-xs text-[#6e7681]">✓</span>
              )}
            </Button>
              ))}
              
              {!prioritizedUsers.length && workspaceMembers.length > 0 && (
                <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
                  No people match your search
                </div>
              )}
              
              {!isLoading && workspaceMembers.length === 0 && (
                <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
                  No members found
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}