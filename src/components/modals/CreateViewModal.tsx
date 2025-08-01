"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Eye,
  User,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/context/WorkspaceContext';
import FilterDropdown from '@/components/views/shared/FilterDropdown';
import DisplayDropdown from '@/components/views/shared/DisplayDropdown';
import ViewTypeSelector from '@/components/views/shared/ViewTypeSelector';
import FilterTags from '@/components/views/shared/FilterTags';

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
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    displayType: 'LIST',
    targetWorkspaceId: workspaceId,
    visibility: 'WORKSPACE',
    projectIds: [] as string[],
    grouping: 'none',
    ordering: 'manual',
    displayProperties: ['Priority', 'Status', 'Assignee'],
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const { toast } = useToast();

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

    setIsLoading(true);
    
    try {
      const response = await fetch(`/api/workspaces/${formData.targetWorkspaceId}/views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          displayType: formData.displayType,
          visibility: formData.visibility,
          projectIds: formData.projectIds,
          filters: selectedFilters,
          sorting: { field: formData.ordering, direction: 'asc' },
          grouping: { field: formData.grouping },
          fields: formData.displayProperties,
          layout: {
            showSubtasks: true,
            showLabels: true,
            showAssigneeAvatars: true
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create view');
      }

      const { view } = await response.json();
      
      toast({
        title: 'Success',
        description: 'View created successfully'
      });
      
      onViewCreated?.(view);
      onClose();
      
    } catch (error) {
      console.error('Error creating view:', error);
      toast({
        title: 'Error',
        description: 'Failed to create view',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProject = (projectId: string) => {
    setFormData(prev => ({
      ...prev,
      projectIds: prev.projectIds.includes(projectId)
        ? prev.projectIds.filter(id => id !== projectId)
        : [...prev.projectIds, projectId]
    }));
  };

  const handleFilterChange = (filterId: string, value: string, isSelected: boolean) => {
    setSelectedFilters(prev => {
      if (isSelected) {
        return {
          ...prev,
          [filterId]: prev[filterId] ? [...prev[filterId], value] : [value]
        };
      } else {
        return {
          ...prev,
          [filterId]: prev[filterId]?.filter(v => v !== value) || []
        };
      }
    });
  };

  const removeFilter = (filterId: string, value?: string) => {
    setSelectedFilters(prev => {
      if (!value) {
        const { [filterId]: removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [filterId]: prev[filterId]?.filter(v => v !== value) || []
      };
    });
  };

  const handleDisplayTypeChange = (newType: string) => {
    const newDisplayProperties = (() => {
      switch (newType) {
        case 'LIST': return ['Priority', 'Status', 'Assignee'];
        case 'KANBAN': return ['Assignee', 'Priority', 'Labels'];
        case 'TIMELINE': return ['Priority', 'Assignee', 'Status'];
        default: return ['Priority', 'Status', 'Assignee'];
      }
    })();

    const newGrouping = newType === 'KANBAN' ? 'status' : 'none';
    const newOrdering = newType === 'TIMELINE' ? 'startDate' : 'manual';

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
      <DialogContent className="max-w-4xl max-h-[90vh] bg-[#090909] border-[#1f1f1f] text-white overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-[#1f1f1f] flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1f1f1f] rounded-lg">
              <Eye className="h-4 w-4 text-[#999]" />
            </div>
            <DialogTitle className="text-xl font-medium text-white">Create view</DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#999]">Save to</span>
            
            {/* Workspace/Personal Selector */}
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
              <SelectTrigger className="h-7 w-auto min-w-[100px] bg-[#5e4ec9] border-[#5e4ec9] text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#090909] border-[#1f1f1f]">
                <SelectItem value="PERSONAL" className="text-white focus:bg-[#1f1f1f]">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3" />
                    Personal
                  </div>
                </SelectItem>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id} className="text-white focus:bg-[#1f1f1f]">
                    <div className="flex items-center gap-2">
                      {workspace.logoUrl ? (
                        <img src={workspace.logoUrl} alt="" className="h-3 w-3 rounded" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      {workspace.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="ghost" size="sm" className="h-7 px-3 text-[#999] hover:text-white">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !formData.name.trim()}
              size="sm" 
              className="h-7 px-3 bg-[#0969da] hover:bg-[#0860ca] text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* View Name and Description */}
            <div className="space-y-4">
              <div>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="View Name"
                  className="text-xl font-medium bg-transparent border-none p-0 h-auto text-white placeholder-[#666] focus-visible:ring-0"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description (optional)"
                  className="bg-transparent border-none p-0 min-h-[60px] text-[#999] placeholder-[#666] resize-none focus-visible:ring-0"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* View Type Selection */}
            <ViewTypeSelector
              selectedType={formData.displayType}
              onTypeChange={handleDisplayTypeChange}
              variant="modal"
              availableTypes={['LIST', 'KANBAN', 'TIMELINE']}
            />

            {/* Filter and Display Controls */}
            <div className="flex items-center gap-2">
              <FilterDropdown
                selectedFilters={selectedFilters}
                onFilterChange={handleFilterChange}
                variant="modal"
                projects={projects}
              />

              <DisplayDropdown
                displayType={formData.displayType}
                grouping={formData.grouping}
                ordering={formData.ordering}
                displayProperties={formData.displayProperties}
                onGroupingChange={(grouping) => setFormData(prev => ({ ...prev, grouping }))}
                onOrderingChange={(ordering) => setFormData(prev => ({ ...prev, ordering }))}
                onDisplayPropertiesChange={(properties) => setFormData(prev => ({ ...prev, displayProperties: properties }))}
                variant="modal"
              />
            </div>

            {/* Active Filters Display */}
            {Object.keys(selectedFilters).length > 0 && (
              <div className="space-y-2">
                <span className="text-sm text-[#999]">Active filters:</span>
                <FilterTags
                  filters={selectedFilters}
                  onRemove={removeFilter}
                  projects={projects}
                  variant="modal"
                />
              </div>
            )}

            {/* Projects List */}
            {projects.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white font-medium">Projects</span>
                  <span className="text-xs text-[#666]">
                    {formData.projectIds.length === 0 ? 'All projects included' : `${formData.projectIds.length} selected`}
                  </span>
                </div>
                
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-[#1f1f1f] cursor-pointer"
                      onClick={() => toggleProject(project.id)}
                    >
                      <Checkbox
                        checked={formData.projectIds.includes(project.id)}
                        className="border-[#2a2a2a] data-[state=checked]:bg-[#0969da] data-[state=checked]:border-[#0969da]"
                      />
                      <div 
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: project.color || '#6b7280' }}
                      />
                      <span className="text-sm text-white flex-1">{project.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
