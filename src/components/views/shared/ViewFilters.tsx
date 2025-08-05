"use client";

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Settings,
  X,
  User,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ViewFiltersProps {
  issues: any[];
  workspace: any;
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
  showSubIssues: boolean;
  onSubIssuesToggle: () => void;
  viewType: 'kanban' | 'list' | 'timeline';
}

type FilterTab = 'assignees' | 'labels' | 'priority' | 'projects';

export default function ViewFilters({
  issues,
  workspace,
  isOpen,
  onToggle,
  selectedFilters,
  onFiltersChange,
  showSubIssues,
  onSubIssuesToggle,
  viewType
}: ViewFiltersProps) {
  const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>('assignees');

  // Filter handlers
  const handleFilterToggle = useCallback((filterType: keyof typeof selectedFilters, filterId: string) => {
    const currentFilters = selectedFilters[filterType];
    const isSelected = currentFilters.includes(filterId);
    
    if (isSelected) {
      onFiltersChange({
        ...selectedFilters,
        [filterType]: currentFilters.filter(id => id !== filterId)
      });
    } else {
      onFiltersChange({
        ...selectedFilters,
        [filterType]: [...currentFilters, filterId]
      });
    }
  }, [selectedFilters, onFiltersChange]);

  const clearAllFilters = useCallback(() => {
    onFiltersChange({
      assignees: [],
      labels: [],
      priority: [],
      projects: []
    });
  }, [onFiltersChange]);

  // Get filter data with counts
  const filterData = useMemo(() => {
    const assignees = new Map();
    const labels = new Map();
    const priorities = new Map();
    const projects = new Map();
    
    // Count unassigned
    assignees.set('unassigned', {
      id: 'unassigned',
      name: 'No assignee',
      count: 0,
      avatar: null
    });
    
    // Count no labels
    labels.set('no-labels', {
      id: 'no-labels',
      name: 'No labels',
      count: 0,
      color: null
    });
    
    // Count no priority
    priorities.set('no-priority', {
      id: 'no-priority',
      name: 'No priority',
      count: 0
    });
    
    // Count no project
    projects.set('no-project', {
      id: 'no-project',
      name: 'No project',
      count: 0,
      color: null
    });
    
    // Process all issues for accurate counts
    issues.forEach((issue: any) => {
      // Count assignees
      const assigneeId = issue.assignee?.id || 'unassigned';
      if (!assignees.has(assigneeId) && issue.assignee) {
        assignees.set(assigneeId, {
          id: assigneeId,
          name: issue.assignee.name,
          avatar: issue.assignee.image,
          count: 0
        });
      }
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
          if (!labels.has(label.id)) {
            labels.set(label.id, {
              id: label.id,
              name: label.name,
              color: label.color,
              count: 0
            });
          }
          const labelData = labels.get(label.id);
          if (labelData) labelData.count++;
        });
      }
      
      // Count priorities
      const priority = issue.priority || 'no-priority';
      if (!priorities.has(priority) && issue.priority) {
        priorities.set(priority, {
          id: priority,
          name: priority === 'URGENT' ? 'Urgent' :
                priority === 'HIGH' ? 'High' :
                priority === 'MEDIUM' ? 'Medium' :
                priority === 'LOW' ? 'Low' : priority,
          count: 0
        });
      }
      const priorityData = priorities.get(priority);
      if (priorityData) {
        priorityData.count++;
      }
      
      // Count projects
      const projectId = issue.project?.id || 'no-project';
      if (!projects.has(projectId) && issue.project) {
        projects.set(projectId, {
          id: projectId,
          name: issue.project.name,
          color: issue.project.color,
          count: 0
        });
      }
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
  }, [issues]);

  // Check if any filters are active
  const hasActiveFilters = selectedFilters.assignees.length > 0 || 
                          selectedFilters.labels.length > 0 || 
                          selectedFilters.priority.length > 0 || 
                          selectedFilters.projects.length > 0;

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-[#090909] border-l border-[#1f1f1f] overflow-hidden flex flex-col flex-shrink-0">
      {/* Compact Sidebar Header */}
      <div className="p-3 border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">Filters</h3>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onToggle}
            className="h-6 w-6 p-0 text-[#666] hover:text-white"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Compact Workspace Info */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 bg-purple-500 rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">
              {workspace?.name?.charAt(0) || 'W'}
            </span>
          </div>
          <span className="text-white text-sm font-medium">{workspace?.name || 'Workspace'}</span>
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
            <button
              key={tab.id}
              onClick={() => setActiveFilterTab(tab.id as FilterTab)}
              className={cn(
                "flex-1 px-2 py-1.5 text-xs font-medium border-b-2 transition-colors",
                activeFilterTab === tab.id
                  ? "text-white border-[#0969da] bg-[#0969da]/10"
                  : "text-[#999] border-transparent hover:text-white hover:bg-[#1f1f1f]"
              )}
            >
              {tab.label}
            </button>
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
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#999]">Show sub-issues</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSubIssuesToggle}
            className="h-6 w-6 p-0"
          >
            {showSubIssues ? (
              <Eye className="h-3 w-3 text-[#0969da]" />
            ) : (
              <EyeOff className="h-3 w-3 text-[#666]" />
            )}
          </Button>
        </div>
        
        {/* View-specific options */}
        {viewType === 'kanban' && (
          <div className="mt-2 pt-2 border-t border-[#1f1f1f]">
            <div className="text-xs text-[#666] text-center">
              Drag & drop to reorganize
            </div>
          </div>
        )}
        
        {viewType === 'list' && (
          <div className="mt-2 pt-2 border-t border-[#1f1f1f]">
            <div className="text-xs text-[#666] text-center">
              Click to view details
            </div>
          </div>
        )}
        
        
        {viewType === 'timeline' && (
          <div className="mt-2 pt-2 border-t border-[#1f1f1f]">
            <div className="text-xs text-[#666] text-center">
              Timeline view
            </div>
          </div>
        )}
      </div>
    </div>
  );
}