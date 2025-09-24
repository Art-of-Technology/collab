"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  FolderOpen,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCreateProject } from '@/hooks/queries/useProjects';
import { isValidNewIssuePrefix } from '@/lib/shared-issue-key-utils';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onProjectCreated?: (project: any) => void;
}

const DEFAULT_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple  
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#84cc16', // Lime
];

export default function CreateProjectModal({
  isOpen,
  onClose,
  workspaceId,
  onProjectCreated
}: CreateProjectModalProps) {
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: DEFAULT_COLORS[0],
    issuePrefix: '',
  });
  
  const [prefixError, setPrefixError] = useState<string | null>(null);
  
  const { toast } = useToast();
  const createProjectMutation = useCreateProject();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'Project name is required',
        variant: 'destructive'
      });
      return;
    }

    // Validate issue prefix if provided
    if (formData.issuePrefix && !isValidNewIssuePrefix(formData.issuePrefix)) {
      setPrefixError('Issue prefix must start with a letter and contain only letters and numbers (no spaces). Example: "SPAPR", "PROJ", "TEAM1"');
      toast({
        title: 'Error',
        description: 'Invalid issue prefix format',
        variant: 'destructive'
      });
      return;
    }

    try {
      const projectData = {
        name: formData.name,
        description: formData.description || undefined,
        color: formData.color,
        issuePrefix: formData.issuePrefix || undefined,
      };

      const result = await createProjectMutation.mutateAsync({
        workspaceId,
        projectData
      });
      
      toast({
        title: 'Success',
        description: 'Project created successfully'
      });
      
      onProjectCreated?.(result.project);
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        color: DEFAULT_COLORS[0],
        issuePrefix: '',
      });
      setPrefixError(null);
      
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create project',
        variant: 'destructive'
      });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear prefix error when user starts typing
    if (field === 'issuePrefix') {
      setPrefixError(null);
    }
  };

  // Generate preview of what the prefix would be (no spaces allowed)
  const generatePreviewPrefix = (projectName: string): string => {
    if (!projectName.trim()) return '';
    
    const baseName = projectName.trim().toUpperCase();
    
    // Try different strategies (remove spaces and special characters)
    const strategies = [
      // Remove spaces and take first 3-4 characters
      baseName.replace(/[\s-_]+/g, '').substring(0, 3),
      baseName.replace(/[\s-_]+/g, '').substring(0, 4),
      // Take first letter of each word
      baseName.split(/[\s-_]+/).map(word => word.charAt(0)).join('').substring(0, 4),
      baseName.split(/[\s-_]+/).map(word => word.charAt(0)).join(''),
    ];
    
    // Return first valid strategy (letters/numbers only, starts with letter)
    return strategies.find(prefix => 
      prefix.length >= 2 && 
      /^[A-Z][A-Z0-9]*$/.test(prefix)
    ) || baseName.replace(/[\s-_]+/g, '').substring(0, 3);
  };

  const previewPrefix = !formData.issuePrefix && formData.name 
    ? generatePreviewPrefix(formData.name) 
    : formData.issuePrefix;

  const handleClose = () => {
    // Reset form on close
    setFormData({
      name: '',
      description: '',
      color: DEFAULT_COLORS[0],
      issuePrefix: '',
    });
    setPrefixError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 bg-[#0e0e0e] border-[#1a1a1a] overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Create project</DialogTitle>
        </DialogHeader>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-sm flex items-center justify-center"
              style={{ backgroundColor: formData.color }}
            >
              <FolderOpen className="h-2.5 w-2.5 text-white" />
            </div>
            <h2 className="text-sm font-medium text-[#e6edf3]">Create project</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-6 w-6 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Basic Information */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">
                Project name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter project name..."
                className="bg-[#0e0e0e] border-[#1a1a1a] text-[#e6edf3] placeholder:text-[#8b949e] focus:border-[#0969da] focus:ring-[#0969da]"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">
                Description
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="What is this project about?"
                className="bg-[#0e0e0e] border-[#1a1a1a] text-[#e6edf3] placeholder:text-[#8b949e] focus:border-[#0969da] focus:ring-[#0969da] resize-none"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">
                Issue prefix (optional)
              </label>
              <div className="relative">
                <Input
                  value={formData.issuePrefix}
                  onChange={(e) => {
                    // Convert to uppercase first, then remove spaces and special characters
                    const cleanValue = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    handleInputChange('issuePrefix', cleanValue);
                  }}
                  placeholder={previewPrefix || "Auto-generated from project name"}
                  className={cn(
                    "bg-[#0e0e0e] border-[#1a1a1a] text-[#e6edf3] placeholder:text-[#8b949e] focus:border-[#0969da] focus:ring-[#0969da]",
                    prefixError && "border-red-500 focus:border-red-500 focus:ring-red-500"
                  )}
                  maxLength={10}
                />
                {previewPrefix && !formData.issuePrefix && !prefixError && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-[#666] pointer-events-none">
                    Preview: {previewPrefix}
                  </div>
                )}
              </div>
              {prefixError ? (
                <p className="text-xs text-red-400 mt-1">
                  {prefixError}
                </p>
              ) : (
                <p className="text-xs text-[#8b949e] mt-1">
                  {previewPrefix && !formData.issuePrefix 
                    ? `Will auto-generate as "${previewPrefix}" (e.g. ${previewPrefix}-1)`
                    : "Used to prefix issue keys (e.g. PROJ-1, TEAM-5). No spaces allowed. Leave empty for automatic generation."
                  }
                </p>
              )}
            </div>
          </div>

          <Separator className="bg-[#1a1a1a]" />

          {/* Color Selection */}
          <div>
            <label className="block text-xs font-medium text-[#e6edf3] mb-2">
              Project color
            </label>
            <div className="flex gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleInputChange('color', color)}
                  className={cn(
                    "w-8 h-8 rounded-md border-2 transition-all duration-200",
                    formData.color === color 
                      ? "border-[#0969da] scale-110" 
                      : "border-[#1a1a1a] hover:border-[#333] hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <Separator className="bg-[#1a1a1a]" />

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              className="h-8 px-3 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name.trim() || createProjectMutation.isPending}
              className="h-8 px-3 bg-[#0969da] hover:bg-[#0860ca] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createProjectMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create project'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
