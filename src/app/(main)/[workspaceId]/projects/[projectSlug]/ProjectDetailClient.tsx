"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  MoreHorizontal, 
  Plus, 
  Grid,
  List,
  Table,
  Calendar,
  BarChart3,
  Share,
  Edit,
  Trash2,
  Users,
  Save,
  RotateCcw,
  Filter,
  Eye,
  EyeOff,
  FolderOpen,
  ArrowLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import ListViewRenderer from '@/components/views/renderers/ListViewRenderer';
import KanbanViewRenderer from '@/components/views/renderers/KanbanViewRenderer';
import TableViewRenderer from '@/components/views/renderers/TableViewRenderer';
import TimelineViewRenderer from '@/components/views/renderers/TimelineViewRenderer';
import FilterDropdown from '@/components/views/shared/FilterDropdown';
import DisplayDropdown from '@/components/views/shared/DisplayDropdown';
import ViewTypeSelector from '@/components/views/shared/ViewTypeSelector';
import ViewFilters from '@/components/views/shared/ViewFilters';
import { useToast } from '@/hooks/use-toast';
import { useViewPositions, mergeIssuesWithViewPositions } from '@/hooks/queries/useViewPositions';
import { useQueryClient } from '@tanstack/react-query';
import { useIssuesByWorkspace, issueKeys } from '@/hooks/queries/useIssues';
import PageHeader, { pageHeaderButtonStyles, pageHeaderSearchStyles } from '@/components/layout/PageHeader';
import NewIssueModal from '@/components/issue/NewIssueModal';
import { cn } from '@/lib/utils';

interface ProjectDetailClientProps {
  project: any;
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
}

const VIEW_TYPE_ICONS = {
  LIST: List,
  KANBAN: Grid,
  TABLE: Table,
  TIMELINE: Calendar,
  BOARD: Grid
};

export default function ProjectDetailClient({ 
  project,
  view: initialView, 
  issues: initialIssues, 
  workspace, 
  currentUser 
}: ProjectDetailClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNewIssueModal, setShowNewIssueModal] = useState(false);
  const [tempDisplayType, setTempDisplayType] = useState(initialView.displayType);
  const [tempDisplayProperties, setTempDisplayProperties] = useState<string[]>(initialView.fields || []);
  const [tempGrouping, setTempGrouping] = useState(initialView.grouping?.field || 'status');
  const [tempSorting, setTempSorting] = useState(initialView.sorting?.field || 'updated');
  const [tempFilters, setTempFilters] = useState<Record<string, string[]>>(initialView.filters || {});
  const [showSubIssues, setShowSubIssues] = useState(initialView.layout?.showSubtasks ?? true);

  // Get updated issues if needed
  const { data: liveIssues } = useIssuesByWorkspace(workspace.id);

  // Filter issues by project
  const projectIssues = useMemo(() => {
    const issuesToUse = liveIssues && liveIssues.length > 0 ? liveIssues : initialIssues;
    return issuesToUse.filter((issue: any) => issue.projectId === project.id);
  }, [liveIssues, initialIssues, project.id]);

  // Get view positions for kanban
  const { data: viewPositions = [] } = useViewPositions(initialView.id);
  const issuesWithPositions = mergeIssuesWithViewPositions(projectIssues, Array.isArray(viewPositions) ? viewPositions : []);

  // Filter issues based on search
  const filteredIssues = useMemo(() => {
    let filtered = issuesWithPositions;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(issue => 
        issue.title.toLowerCase().includes(query) ||
        issue.issueKey.toLowerCase().includes(query) ||
        issue.description?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [issuesWithPositions, searchQuery]);

  // Apply sorting
  const sortedIssues = useMemo(() => {
    const sorted = [...filteredIssues];
    
    switch (tempSorting) {
      case 'created':
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'updated':
        return sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      case 'priority': {
        const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        return sorted.sort((a, b) => {
          const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
          const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
          return bPriority - aPriority;
        });
      }
      case 'dueDate': {
        return sorted.sort((a, b) => {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return aDate - bDate;
        });
      }
      default:
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
  }, [filteredIssues, tempSorting]);

  // Handlers
  const handleBackToProjects = () => {
    router.push(`/${workspace.slug || workspace.id}/projects`);
  };

  const handleIssueUpdate = async (issueId: string, updates: any) => {
    try {
      // Handle issue updates
      console.log('Updating issue:', issueId, updates);
      // TODO: Implement issue update API call
    } catch (error) {
      console.error('Failed to update issue:', error);
      toast({
        title: "Error",
        description: "Failed to update issue",
        variant: "destructive",
      });
    }
  };

  const handleCreateIssue = () => {
    setShowNewIssueModal(true);
  };

  const handleDisplayTypeChange = (type: string) => {
    setTempDisplayType(type);
    setHasUnsavedChanges(true);
  };

  const handleDisplayPropertiesChange = (properties: string[]) => {
    setTempDisplayProperties(properties);
    setHasUnsavedChanges(true);
  };

  const handleGroupingChange = (grouping: string) => {
    setTempGrouping(grouping);
    setHasUnsavedChanges(true);
  };

  const handleSortingChange = (sorting: string) => {
    setTempSorting(sorting);
    setHasUnsavedChanges(true);
  };

  const handleFilterChange = (filterId: string, value: string, isSelected: boolean) => {
    setTempFilters(prev => {
      const updated = { ...prev };
      
      if (isSelected) {
        // Add filter value
        updated[filterId] = [...(updated[filterId] || []), value];
      } else {
        // Remove filter value
        updated[filterId] = (updated[filterId] || []).filter(v => v !== value);
        if (updated[filterId].length === 0) {
          delete updated[filterId];
        }
      }
      
      // Always keep project filter
      updated.project = [project.id];
      
      setHasUnsavedChanges(true);
      return updated;
    });
  };

  const handleSaveAsNewView = async () => {
    if (!newViewName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a view name",
        variant: "destructive",
      });
      return;
    }

    try {
      // TODO: Implement save as new view API call
      console.log('Saving new view:', {
        name: newViewName,
        displayType: tempDisplayType,
        filters: tempFilters,
        grouping: tempGrouping,
        sorting: tempSorting,
        fields: tempDisplayProperties,
        projectId: project.id
      });

      toast({
        title: "Success",
        description: `View "${newViewName}" has been created`,
      });

      setShowSaveDialog(false);
      setNewViewName('');
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save view:', error);
      toast({
        title: "Error",
        description: "Failed to save view",
        variant: "destructive",
      });
    }
  };

  const handleResetChanges = () => {
    setTempDisplayType(initialView.displayType);
    setTempDisplayProperties(initialView.fields || []);
    setTempGrouping(initialView.grouping?.field || 'status');
    setTempSorting(initialView.sorting?.field || 'updated');
    setTempFilters(initialView.filters || {});
    setHasUnsavedChanges(false);
  };

  // Create current view object with temporary changes
  const currentView = {
    ...initialView,
    displayType: tempDisplayType,
    fields: tempDisplayProperties,
    grouping: { field: tempGrouping },
    sorting: { field: tempSorting },
    filters: tempFilters
  };

  // Render view content based on display type
  const renderViewContent = () => {
    const sharedProps = {
      view: currentView,
      issues: sortedIssues,
      workspace,
      currentUser,
      activeFilters: tempFilters,
      setActiveFilters: (filters: Record<string, string[]>) => {
        setTempFilters(filters);
      },
      onIssueUpdate: handleIssueUpdate,
      displayProperties: tempDisplayProperties,
      showSubIssues
    };

    switch (tempDisplayType) {
      case 'KANBAN':
      case 'BOARD':
        return (
          <KanbanViewRenderer 
            {...sharedProps} 
            projectId={project.id}
            workspaceId={workspace.id}
            currentUserId={currentUser.id}
            onIssueCreated={() => {
              // Refresh issues using correct query key
              queryClient.invalidateQueries({ queryKey: issueKeys.byWorkspace(workspace.id) });
            }}
          />
        );
      case 'TABLE':
        return <TableViewRenderer {...sharedProps} />;
      case 'TIMELINE':
        return <TimelineViewRenderer {...sharedProps} />;
      case 'LIST':
      default:
        return <ListViewRenderer {...sharedProps} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <PageHeader
        leftContent={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToProjects}
            className="h-6 px-2 text-xs text-[#7d8590] hover:text-[#e6edf3] mr-3"
          >
            <ArrowLeft className="w-3 h-3 mr-1" />
            Projects
          </Button>
        }
        icon={FolderOpen}
        title={
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded"
              style={{ backgroundColor: project.color || '#6b7280' }}
            />
            {project.name}
          </div>
        }
        subtitle={`${sortedIssues.length} issue${sortedIssues.length !== 1 ? 's' : ''}`}
        search={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-[#666]" />
            <Input
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(pageHeaderSearchStyles, "w-64")}
            />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {/* View Type Selector */}
            <ViewTypeSelector
              selectedType={tempDisplayType}
              onTypeChange={handleDisplayTypeChange}
            />

            {/* Display Properties - TODO: Fix props */}
            {/* <DisplayDropdown
              displayProperties={tempDisplayProperties}
              onPropertiesChange={handleDisplayPropertiesChange}
              showSubIssues={showSubIssues}
              onShowSubIssuesChange={setShowSubIssues}
            /> */}

            {/* Filters */}
            <FilterDropdown
              selectedFilters={tempFilters}
              onFilterChange={handleFilterChange}
              variant="toolbar"
            />

            {/* Save/Reset buttons when there are unsaved changes */}
            {hasUnsavedChanges && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetChanges}
                  className={cn(pageHeaderButtonStyles.reset, "h-6")}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSaveDialog(true)}
                  className={cn(pageHeaderButtonStyles.update, "h-6")}
                >
                  <Save className="w-3 h-3 mr-1" />
                  Save as view
                </Button>
              </>
            )}

            {/* Create Issue */}
            <Button
              onClick={handleCreateIssue}
              className={cn(pageHeaderButtonStyles.primary, "h-7 px-3")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New issue
            </Button>

            {/* Project Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#090909] border-[#1f1f1f]">
                <DropdownMenuItem className="text-gray-300">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit project
                </DropdownMenuItem>
                <DropdownMenuItem className="text-gray-300">
                  <Users className="w-4 h-4 mr-2" />
                  Manage members
                </DropdownMenuItem>
                <DropdownMenuItem className="text-gray-300">
                  <Share className="w-4 h-4 mr-2" />
                  Share project
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#1f1f1f]" />
                <DropdownMenuItem className="text-red-400">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Archive project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />



      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        {renderViewContent()}
      </div>

      {/* Save View Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-[#090909] border-[#1f1f1f]">
          <DialogHeader>
            <DialogTitle className="text-white">Save as new view</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                View name
              </label>
              <Input
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="Enter view name..."
                className="bg-[#1f1f1f] border-[#2a2a2a] text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowSaveDialog(false)}
                className="border-[#333] text-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAsNewView}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-white"
              >
                Save view
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Issue Modal */}
      <NewIssueModal
        open={showNewIssueModal}
        onOpenChange={setShowNewIssueModal}
        workspaceId={workspace.id}
        projectId={project.id}
        currentUserId={currentUser.id}
        onCreated={(issueId) => {
          console.log("Issue created:", issueId);
          // No need for manual invalidation - useCreateIssue hook already handles it properly
        }}
      />
    </div>
  );
}
