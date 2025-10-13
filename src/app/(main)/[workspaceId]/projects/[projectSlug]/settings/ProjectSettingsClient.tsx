"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Settings, 
  Save, 
  ArrowLeft, 
  Plus, 
  X,
  FileText,
  Circle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useProject, ProjectStatus } from '@/hooks/queries/useProjects';
import { cn } from '@/lib/utils';
import { DEFAULT_PROJECT_STATUSES, validateStatusDisplayName } from '@/constants/project-statuses';
import PageHeader, { pageHeaderButtonStyles } from '@/components/layout/PageHeader';
import { isValidNewIssuePrefix } from '@/lib/shared-issue-key-utils';
import { GitHubRepositorySettings } from '@/components/github/GitHubRepositorySettings';

interface ProjectSettingsClientProps {
  workspaceId: string;
  projectSlug: string;
}

export default function ProjectSettingsClient({ workspaceId, projectSlug }: ProjectSettingsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  
  // Fetch project data using the hook
  const { data: project, isLoading: loading, refetch: refetchProject } = useProject(workspaceId, projectSlug);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    keyPrefix: '',
    color: '#6366f1'
  });
  
  // Status management state
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#6366f1');
  
  // Status deletion state
  const [statusToDelete, setStatusToDelete] = useState<ProjectStatus | null>(null);
  const [statusIssueCount, setStatusIssueCount] = useState(0);
  const [targetStatusId, setTargetStatusId] = useState<string>('');
  const [deletingStatus, setDeletingStatus] = useState(false);
  
  // Prefix validation state
  const [prefixError, setPrefixError] = useState<string | null>(null);

  // Default status colors
  const statusColors = [
    '#6366f1', // indigo
    '#8b5cf6', // violet  
    '#3b82f6', // blue
    '#06b6d4', // cyan
    '#10b981', // emerald
    '#84cc16', // lime
    '#eab308', // yellow
    '#f59e0b', // amber
    '#f97316', // orange
    '#ef4444', // red
    '#ec4899', // pink
    '#6b7280'  // gray
  ];

  // Initialize form data when project loads
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        description: project.description || '',
        keyPrefix: project.keyPrefix || '',
        color: project.color || '#6366f1'
      });
      
      // Clear any prefix errors when loading project data
      setPrefixError(null);
      
      // Set statuses - use project statuses if available, otherwise default ones
      if (project.statuses && project.statuses.length > 0) {
        setStatuses(project.statuses);
      } else {
        // Use default statuses from constants to ensure consistency
        setStatuses(DEFAULT_PROJECT_STATUSES.map(status => ({
          id: status.name,
          name: status.displayName,
          color: status.color,
          order: status.order,
          isDefault: status.isDefault
        })));
      }
    }
  }, [project]);

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Validate issue prefix if provided
      if (formData.keyPrefix && !isValidNewIssuePrefix(formData.keyPrefix)) {
        setPrefixError('Issue prefix must start with a letter and contain only letters and numbers (no spaces)');
        toast({
          title: "Error",
          description: "Invalid issue prefix format",
          variant: "destructive"
        });
        return;
      }
      
      const response = await fetch(`/api/workspaces/${workspaceId}/projects/${projectSlug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          statuses: statuses
        }),
      });

      if (!response.ok) {
        // Extract error message from API response
        const errorData = await response.json().catch(() => ({ error: 'Failed to update project' }));
        throw new Error(errorData.error || 'Failed to update project');
      }

      toast({
        title: "Success",
        description: "Project settings updated successfully",
      });

      // Refresh project data
      await refetchProject();
    } catch (error) {
      console.error('Error updating project:', error);
      
      // Display the actual error message from the API
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project settings';
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;

    // Validate the status name
    const validation = validateStatusDisplayName(newStatusName.trim());
    if (!validation.valid) {
      toast({
        title: "Invalid Status Name",
        description: validation.error,
        variant: "destructive"
      });
      return;
    }

    const newStatus: ProjectStatus = {
      id: `status-${Date.now()}`,
      name: newStatusName.trim(),
      color: newStatusColor,
      order: statuses.length
    };

    setStatuses([...statuses, newStatus]);
    setNewStatusName('');
    setNewStatusColor('#6366f1');
  };

  const handleRemoveStatus = async (statusId: string) => {
    const status = statuses.find(s => s.id === statusId);
    if (!status) return;

    // Check if this status has any issues
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/projects/${projectSlug}/statuses/${statusId}/issues-count`);
      if (!response.ok) throw new Error('Failed to check status usage');
      
      const { count } = await response.json();
      
      if (count > 0) {
        // If status has issues, show confirmation modal
        setStatusToDelete(status);
        setStatusIssueCount(count);
        setTargetStatusId('');
      } else {
        // If no issues, delete directly
        setStatuses(statuses.filter(s => s.id !== statusId));
      }
    } catch (error) {
      console.error('Error checking status usage:', error);
      toast({
        title: "Error",
        description: "Failed to check if status is being used",
        variant: "destructive"
      });
    }
  };

  const handleConfirmStatusDeletion = async () => {
    if (!statusToDelete || !targetStatusId) return;

    try {
      setDeletingStatus(true);
      
      // Call API to move issues and delete status
      const response = await fetch(`/api/workspaces/${workspaceId}/projects/${projectSlug}/statuses/${statusToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetStatusId
        }),
      });

      if (!response.ok) throw new Error('Failed to delete status');

      // Remove status from local state
      setStatuses(statuses.filter(s => s.id !== statusToDelete.id));
      
      // Close modal
      setStatusToDelete(null);
      setStatusIssueCount(0);
      setTargetStatusId('');

      toast({
        title: "Success",
        description: `Status deleted and ${statusIssueCount} issue(s) moved to the selected status`,
      });

    } catch (error) {
      console.error('Error deleting status:', error);
      toast({
        title: "Error",
        description: "Failed to delete status",
        variant: "destructive"
      });
    } finally {
      setDeletingStatus(false);
    }
  };

  const handleCancelStatusDeletion = () => {
    setStatusToDelete(null);
    setStatusIssueCount(0);
    setTargetStatusId('');
  };

  const handleStatusColorChange = (statusId: string, color: string) => {
    setStatuses(statuses.map(s => 
      s.id === statusId ? { ...s, color } : s
    ));
  };

  const handleBack = () => {
    router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-[#8b949e] text-sm">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <PageHeader
        icon={Settings}
        title={`${project.name} Settings`}
        subtitle="Manage project configuration and statuses"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleBack}
              variant="ghost"
              className={cn(pageHeaderButtonStyles.ghost, "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]")}
            >
              <ArrowLeft className="h-3.5 w-3.5 md:mr-1.5" />
              <span data-text className="hidden md:inline ml-1">Back to Projects</span>
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className={pageHeaderButtonStyles.primary}
            >
              <Save className="h-3.5 w-3.5 md:mr-1.5" />
              <span data-text className="hidden md:inline ml-1">{saving ? 'Saving...' : 'Save Changes'}</span>
            </Button>
          </div>
        }
      />

      {/* Settings Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          
          {/* Basic Information */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-[#e6edf3] mb-4 flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Basic Information
              </h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-sm font-medium text-[#e6edf3]">
                    Project Name
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 bg-[#0f1011] border-[#1f1f1f] text-[#e6edf3]"
                    placeholder="Enter project name"
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="text-sm font-medium text-[#e6edf3]">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1 bg-[#0f1011] border-[#1f1f1f] text-[#e6edf3]"
                    placeholder="Enter project description"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="keyPrefix" className="text-sm font-medium text-[#e6edf3]">
                      Issue Key Prefix
                    </Label>
                    <Input
                      id="keyPrefix"
                      value={formData.keyPrefix}
                      onChange={(e) => {
                        // Clean input: remove spaces and special characters, convert to uppercase
                        const cleanValue = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        setFormData({ ...formData, keyPrefix: cleanValue });
                        // Clear prefix error when user starts typing
                        if (prefixError) setPrefixError(null);
                      }}
                      className={cn(
                        "mt-1 bg-[#0f1011] border-[#1f1f1f] text-[#e6edf3]",
                        prefixError && "border-red-500 focus:border-red-500 focus:ring-red-500"
                      )}
                      placeholder="e.g., PROJ"
                      maxLength={10}
                    />
                    {prefixError ? (
                      <p className="text-xs text-red-400 mt-1">
                        {prefixError}
                      </p>
                    ) : (
                      <p className="text-xs text-[#8b949e] mt-1">
                        Issues will be numbered as {formData.keyPrefix || 'PROJ'}-1, {formData.keyPrefix || 'PROJ'}-2, etc. No spaces allowed.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="color" className="text-sm font-medium text-[#e6edf3]">
                      Project Color
                    </Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        id="color"
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="w-12 h-8 p-1 bg-[#0f1011] border-[#1f1f1f]"
                      />
                      <Input
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="flex-1 bg-[#0f1011] border-[#1f1f1f] text-[#e6edf3]"
                        placeholder="#6366f1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GitHub Integration */}
          <div className="space-y-6">
            <GitHubRepositorySettings 
              projectId={project.id} 
              repository={project.repository}
              onUpdate={refetchProject}
            />
          </div>

          {/* Status Management */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-[#e6edf3] mb-4 flex items-center">
                <Circle className="mr-2 h-5 w-5" />
                Project Statuses
              </h3>
              <p className="text-sm text-[#8b949e] mb-4">
                Configure the available statuses for issues in this project. These will be used across all views.
              </p>
              
              {/* Existing Statuses */}
              <div className="space-y-3 mb-4">
                {statuses.map((status, index) => (
                  <div key={status.id} className="flex items-center gap-3 p-3 bg-[#0f1011] border border-[#1f1f1f] rounded-md">
                    <div className="flex-1 flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="text-[#e6edf3] font-medium">{status.name}</span>
                      {status.isDefault && (
                        <Badge className="h-5 px-2 text-[10px] bg-blue-500/20 text-blue-400 border-0">
                          Default
                        </Badge>
                      )}
                    </div>
                    
                    {/* Color picker for status */}
                    <div className="flex items-center gap-2">
                      {statusColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => handleStatusColorChange(status.id, color)}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-all",
                            status.color === color ? "border-white scale-110" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    {!status.isDefault && (
                      <Button
                        onClick={() => handleRemoveStatus(status.id)}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add New Status */}
              <div className="flex items-center gap-3 p-3 bg-[#0f1011] border border-[#1f1f1f] rounded-md border-dashed">
                <input
                  type="color"
                  value={newStatusColor}
                  onChange={(e) => setNewStatusColor(e.target.value)}
                  className="w-8 h-8 rounded border-0 bg-transparent"
                />
                <Input
                  value={newStatusName}
                  onChange={(e) => setNewStatusName(e.target.value)}
                  placeholder="Status name"
                  className="flex-1 bg-transparent border-0 text-[#e6edf3] focus-visible:ring-0"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
                />
                <Button
                  onClick={handleAddStatus}
                  disabled={!newStatusName.trim()}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/20"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Status Deletion Confirmation Modal */}
      <AlertDialog open={!!statusToDelete} onOpenChange={(open) => !open && handleCancelStatusDeletion()}>
        <AlertDialogContent className="bg-[#090909] border-[#1f1f1f]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#e6edf3]">
              Delete Status "{statusToDelete?.name}"
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#8b949e]">
              This status is currently being used by <strong>{statusIssueCount}</strong> issue{statusIssueCount !== 1 ? 's' : ''}. 
              You need to move {statusIssueCount === 1 ? 'this issue' : 'these issues'} to another status before deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Label htmlFor="target-status" className="text-sm font-medium text-[#e6edf3] mb-2 block">
              Move issues to:
            </Label>
            <Select value={targetStatusId} onValueChange={setTargetStatusId}>
              <SelectTrigger className="bg-[#0f1011] border-[#1f1f1f] text-[#e6edf3]">
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent className="bg-[#090909] border-[#1f1f1f]">
                {statuses
                  .filter(s => s.id !== statusToDelete?.id) // Don't show the status being deleted
                  .map((status) => (
                    <SelectItem 
                      key={status.id} 
                      value={status.id}
                      className="text-[#e6edf3] focus:bg-[#1f1f1f]"
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={handleCancelStatusDeletion}
              className="bg-transparent border-[#1f1f1f] text-[#8b949e] hover:bg-[#1f1f1f] hover:text-[#e6edf3]"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusDeletion}
              disabled={!targetStatusId || deletingStatus}
              className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {deletingStatus ? 'Moving Issues...' : `Move ${statusIssueCount} Issue${statusIssueCount !== 1 ? 's' : ''} & Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
