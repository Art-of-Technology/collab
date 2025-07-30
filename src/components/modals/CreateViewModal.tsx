"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Kanban,
  List,
  Table,
  Calendar,
  BarChart3,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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

const VIEW_TYPES = [
  {
    id: 'KANBAN',
    name: 'Kanban',
    description: 'Visual board with columns',
    icon: Kanban,
    color: '#3b82f6'
  },
  {
    id: 'LIST',
    name: 'List',
    description: 'Simple list view',
    icon: List,
    color: '#10b981'
  },
  {
    id: 'TABLE',
    name: 'Table',
    description: 'Detailed table with sorting',
    icon: Table,
    color: '#8b5cf6'
  },
  {
    id: 'CALENDAR',
    name: 'Calendar',
    description: 'Calendar view by due dates',
    icon: Calendar,
    color: '#f59e0b'
  },
  {
    id: 'TIMELINE',
    name: 'Timeline',
    description: 'Gantt-style timeline',
    icon: BarChart3,
    color: '#ef4444'
  }
];

const VISIBILITY_OPTIONS = [
  {
    id: 'PERSONAL',
    name: 'Personal',
    description: 'Only visible to you'
  },
  {
    id: 'WORKSPACE',
    name: 'Workspace',
    description: 'Visible to all workspace members'
  },
  {
    id: 'SHARED',
    name: 'Shared',
    description: 'Visible to selected people'
  }
];

export default function CreateViewModal({
  isOpen,
  onClose,
  workspaceId,
  projects = [],
  onViewCreated
}: CreateViewModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    displayType: 'KANBAN',
    visibility: 'PERSONAL',
    color: '#3b82f6',
    projectIds: [] as string[]
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const selectedViewType = VIEW_TYPES.find(type => type.id === formData.displayType);

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
      const response = await fetch(`/api/workspaces/${workspaceId}/views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
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
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        displayType: 'KANBAN',
        visibility: 'PERSONAL',
        color: '#3b82f6',
        projectIds: []
      });
      
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

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-[#1c2128] border-[#30363d] text-gray-200">
        <DialogHeader>
          <DialogTitle className="text-white">Create New View</DialogTitle>
          <DialogDescription className="text-gray-400">
            Create a custom view to organize and filter your issues
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-gray-300">
                View Name *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Sprint Planning, Bug Reports"
                className="bg-[#21262d] border-[#30363d] text-gray-200 placeholder-gray-500 focus:border-blue-500"
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-gray-300">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this view"
                className="bg-[#21262d] border-[#30363d] text-gray-200 placeholder-gray-500 focus:border-blue-500 resize-none"
                rows={3}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* View Type Selection */}
          <div>
            <Label className="text-gray-300 mb-3 block">View Type *</Label>
            <div className="grid grid-cols-2 gap-3">
              {VIEW_TYPES.map((viewType) => {
                const Icon = viewType.icon;
                const isSelected = formData.displayType === viewType.id;
                
                return (
                  <button
                    key={viewType.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      displayType: viewType.id,
                      color: viewType.color
                    }))}
                    className={cn(
                      "p-4 rounded-lg border-2 transition-all duration-200 text-left",
                      isSelected
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-[#30363d] bg-[#21262d] hover:border-[#484f58]"
                    )}
                    disabled={isLoading}
                  >
                    <div className="flex items-center gap-3">
                      <Icon 
                        className="h-5 w-5" 
                        style={{ color: viewType.color }}
                      />
                      <div>
                        <h4 className="font-medium text-white">{viewType.name}</h4>
                        <p className="text-sm text-gray-400">{viewType.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visibility */}
          <div>
            <Label htmlFor="visibility" className="text-gray-300">
              Visibility *
            </Label>
            <Select
              value={formData.visibility}
              onValueChange={(value) => setFormData(prev => ({ ...prev, visibility: value }))}
              disabled={isLoading}
            >
              <SelectTrigger className="bg-[#21262d] border-[#30363d] text-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1c2128] border-[#30363d]">
                {VISIBILITY_OPTIONS.map((option) => (
                  <SelectItem 
                    key={option.id} 
                    value={option.id}
                    className="text-gray-200 focus:bg-[#21262d]"
                  >
                    <div>
                      <div className="font-medium">{option.name}</div>
                      <div className="text-sm text-gray-400">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Projects Filter */}
          {projects.length > 0 && (
            <div>
              <Label className="text-gray-300 mb-3 block">
                Projects (optional)
              </Label>
              <p className="text-sm text-gray-400 mb-3">
                Leave empty to include all projects, or select specific projects
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {projects.map((project) => (
                  <label
                    key={project.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-[#21262d] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.projectIds.includes(project.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            projectIds: [...prev.projectIds, project.id]
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            projectIds: prev.projectIds.filter(id => id !== project.id)
                          }));
                        }
                      }}
                      className="rounded border-[#30363d]"
                      disabled={isLoading}
                    />
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="text-sm text-gray-200">{project.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-white hover:bg-[#21262d]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.name.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create View'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
