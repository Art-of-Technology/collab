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
  DialogTrigger,
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
  Star,
  Share,
  Edit,
  Trash2,
  Eye,
  Users,
  Save,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import KanbanViewRenderer from './renderers/KanbanViewRenderer';
import ListViewRenderer from './renderers/ListViewRenderer';
import TableViewRenderer from './renderers/TableViewRenderer';
import TimelineViewRenderer from './renderers/TimelineViewRenderer';
import FilterDropdown from './shared/FilterDropdown';
import DisplayDropdown from './shared/DisplayDropdown';
import ViewTypeSelector from './shared/ViewTypeSelector';
import FilterTags from './shared/FilterTags';
import { useToast } from '@/hooks/use-toast';
import React from 'react'; // Added missing import for React

interface ViewRendererProps {
  view: {
    id: string;
    name: string;
    description?: string;
    type: string;
    displayType: string;
    visibility: string;
    color?: string;
    issueCount: number;
    filters: any;
    sorting?: { field: string; direction: string };
    grouping?: { field: string };
    fields?: string[];
    layout?: any;
    projects: Array<{
      id: string;
      name: string;
      slug: string;
      issuePrefix: string;
      color?: string;
    }>;
    isDefault: boolean;
    isFavorite: boolean;
    createdBy: string;
    sharedWith: string[];
    createdAt: Date;
    updatedAt: Date;
  };
  issues: any[];
  workspace: any;
  currentUser: any;
}

const VIEW_TYPE_ICONS = {
  KANBAN: Grid,
  LIST: List,
  TABLE: Table,
  CALENDAR: Calendar,
  TIMELINE: BarChart3,
  GANTT: BarChart3,
  BOARD: Grid
};

export default function ViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser 
}: ViewRendererProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const { toast } = useToast();

  // Temporary state for filters and display (resets on refresh)
  const [tempFilters, setTempFilters] = useState<Record<string, string[]>>({});
  const [tempDisplayType, setTempDisplayType] = useState(view.displayType);
  const [tempGrouping, setTempGrouping] = useState(view.grouping?.field || 'none');
  const [tempOrdering, setTempOrdering] = useState(view.sorting?.field || 'manual');
  const [tempDisplayProperties, setTempDisplayProperties] = useState(view.fields || []);
  const [tempShowSubIssues, setTempShowSubIssues] = useState(true);
  const [tempShowEmptyGroups, setTempShowEmptyGroups] = useState(true);
  const [tempCompletedIssues, setTempCompletedIssues] = useState('all');

  // Check if current state differs from view defaults
  const hasChanges = useMemo(() => {
    return (
      Object.keys(tempFilters).length > 0 ||
      tempDisplayType !== view.displayType ||
      tempGrouping !== (view.grouping?.field || 'none') ||
      tempOrdering !== (view.sorting?.field || 'manual') ||
      JSON.stringify(tempDisplayProperties) !== JSON.stringify(view.fields || [])
    );
  }, [tempFilters, tempDisplayType, tempGrouping, tempOrdering, tempDisplayProperties, view]);

  // Reset to view defaults
  const resetToDefaults = () => {
    setTempFilters({});
    setTempDisplayType(view.displayType);
    setTempGrouping(view.grouping?.field || 'none');
    setTempOrdering(view.sorting?.field || 'manual');
    setTempDisplayProperties(view.fields || []);
    setTempShowSubIssues(true);
    setTempShowEmptyGroups(true);
    setTempCompletedIssues('all');
  };

  // Apply all filters (view + temp)
  const allFilters = useMemo(() => {
    const combinedFilters = { ...(view.filters || {}), ...tempFilters };
    return combinedFilters;
  }, [view.filters, tempFilters]);

  // Apply view filters and search
  const filteredIssues = useMemo(() => {
    let filtered = [...issues];
    
    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(issue => 
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.issueKey?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    }
    
    // Apply combined filters
    Object.entries(allFilters).forEach(([filterKey, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(issue => {
          switch (filterKey) {
            case 'status':
              return filterValues.includes(issue.status);
            case 'priority':
              return filterValues.includes(issue.priority);
            case 'type':
              return filterValues.includes(issue.type);
            case 'assignee':
              return filterValues.includes(issue.assigneeId);
            case 'project':
              return filterValues.includes(issue.projectId);
            default:
              return true;
          }
        });
      }
    });
    
    return filtered;
  }, [issues, searchQuery, allFilters]);

  // Apply sorting
  const sortedIssues = useMemo(() => {
    const sorted = [...filteredIssues];
    
    const sortField = tempOrdering;
    if (sortField && sortField !== 'manual') {
      sorted.sort((a, b) => {
        let aValue: any;
        let bValue: any;
        
        switch (sortField) {
          case 'priority':
            const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
            bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
            break;
          case 'created':
          case 'createdAt':
            aValue = new Date(a.createdAt).getTime();
            bValue = new Date(b.createdAt).getTime();
            break;
          case 'updated':
          case 'updatedAt':
            aValue = new Date(a.updatedAt).getTime();
            bValue = new Date(b.updatedAt).getTime();
            break;
          case 'dueDate':
            aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
            bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
            break;
          default:
            aValue = a[sortField] || '';
            bValue = b[sortField] || '';
        }
        
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      });
    }
    
    return sorted;
  }, [filteredIssues, tempOrdering]);

  const ViewIcon = VIEW_TYPE_ICONS[tempDisplayType as keyof typeof VIEW_TYPE_ICONS] || List;

  const handleFavoriteToggle = async () => {
    try {
      const response = await fetch(`/api/views/${view.id}/favorite`, {
        method: 'POST'
      });
      
      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleSaveAsNewView = async () => {
    if (!newViewName.trim()) {
      toast({
        title: 'Error',
        description: 'View name is required',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newViewName,
          description: `Copy of ${view.name}`,
          displayType: tempDisplayType,
          visibility: 'PERSONAL',
          projectIds: view.projects.map(p => p.id),
          filters: allFilters,
          sorting: { field: tempOrdering, direction: 'desc' },
          grouping: { field: tempGrouping },
          fields: tempDisplayProperties,
        })
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'New view created successfully'
        });
        setShowSaveDialog(false);
        setNewViewName('');
      }
    } catch (error) {
      console.error('Error creating view:', error);
      toast({
        title: 'Error',
        description: 'Failed to create view',
        variant: 'destructive'
      });
    }
  };

  const handleFilterChange = (filterId: string, value: string, isSelected: boolean) => {
    setTempFilters(prev => {
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

  const removeTempFilter = (filterId: string, value?: string) => {
    setTempFilters(prev => {
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

  const renderViewContent = () => {
    const sharedProps = {
      view: {
        ...view,
        displayType: tempDisplayType,
        grouping: { field: tempGrouping },
        sorting: { field: tempOrdering, direction: 'desc' },
        fields: tempDisplayProperties
      },
      issues: sortedIssues,
      workspace,
      currentUser,
    };

    switch (tempDisplayType) {
      case 'KANBAN':
      case 'BOARD':
        return <KanbanViewRenderer {...sharedProps} />;
      case 'LIST':
        return <ListViewRenderer {...sharedProps} />;
      case 'TABLE':
        return <TableViewRenderer {...sharedProps} />;
      case 'TIMELINE':
        return <TimelineViewRenderer {...sharedProps} />;
      default:
        return <ListViewRenderer {...sharedProps} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] bg-[#101011] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
              {/* View Icon and Name */}
              <div className="flex items-center gap-2">
                {React.createElement(VIEW_TYPE_ICONS[view.type as keyof typeof VIEW_TYPE_ICONS] || List, {
                  className: "h-5 w-5 text-[#9ca3af]"
                })}
                <h1 className="text-xl font-semibold text-white">
                  {view.name}
                </h1>
              </div>
              
              {/* Issue Count */}
              <span className="text-[#666] text-sm">
                {sortedIssues.length} {sortedIssues.length === 1 ? 'issue' : 'issues'}
              </span>
            </div>

            {/* Changes Indicator */}
            {hasChanges && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToDefaults}
                  className="h-7 px-2 text-[#666] hover:text-white text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                      <Button
                  size="sm"
                  onClick={() => setShowSaveDialog(true)}
                  className="h-7 px-3 bg-[#0969da] hover:bg-[#0860ca] text-xs"
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save as new view
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#666]" />
              <Input
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] focus:border-[#0969da] h-8"
              />
            </div>

            {/* New Issue */}
            <Button
              size="sm"
              className="h-8 px-3 bg-[#0969da] hover:bg-[#0860ca] text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Issue
            </Button>

            {/* View Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
                  className="h-8 w-8 text-[#666] hover:text-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                align="end"
                className="bg-[#090909] border-[#1f1f1f] text-white"
              >
                <DropdownMenuItem className="hover:bg-[#1f1f1f]">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit View
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-[#1f1f1f]">
                  <Share className="h-4 w-4 mr-2" />
                  Share View
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-[#1f1f1f]">
                  <Users className="h-4 w-4 mr-2" />
                  Manage Access
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#1f1f1f]" />
                <DropdownMenuItem className="hover:bg-[#1f1f1f] text-red-400">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-[#090909] border-[#1f1f1f] text-white">
          <DialogHeader>
            <DialogTitle>Save as new view</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="View name"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="bg-[#1f1f1f] border-[#2a2a2a] text-white"
            />
            <div className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setShowSaveDialog(false)}
                className="text-[#666]"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveAsNewView}
                className="bg-[#0969da] hover:bg-[#0860ca]"
              >
                Save view
            </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters and Display Controls Bar */}
      <div className="border-b border-[#1a1a1a] bg-[#101011] px-6 py-2">
        <div className="flex items-center justify-between">
          {/* Left: Filters */}
          <div className="flex items-center gap-2">
            <FilterDropdown
              selectedFilters={tempFilters}
              onFilterChange={handleFilterChange}
              variant="toolbar"
              projects={view.projects}
            />

            {/* Only show filter count if filters are active */}
            {Object.keys(allFilters).length > 0 && (
              <Badge 
                variant="secondary" 
                className="text-xs bg-[#1a1a1a] text-[#9ca3af] border-none px-2 py-1"
              >
                {Object.values(allFilters).flat().length} filters
              </Badge>
            )}
          </div>

          {/* Right: Display Controls */}
          <div className="flex items-center gap-2">
            {/* View Type Selector */}
            <ViewTypeSelector
              selectedType={tempDisplayType}
              onTypeChange={setTempDisplayType}
              variant="toolbar"
              availableTypes={['LIST', 'KANBAN']}
            />

            {/* Display Dropdown */}
            <DisplayDropdown
              displayType={tempDisplayType}
              grouping={tempGrouping}
              ordering={tempOrdering}
              displayProperties={tempDisplayProperties}
              showSubIssues={tempShowSubIssues}
              showEmptyGroups={tempShowEmptyGroups}
              completedIssues={tempCompletedIssues}
              onGroupingChange={setTempGrouping}
              onOrderingChange={setTempOrdering}
              onDisplayPropertiesChange={setTempDisplayProperties}
              onShowSubIssuesChange={setTempShowSubIssues}
              onShowEmptyGroupsChange={setTempShowEmptyGroups}
              onCompletedIssuesChange={setTempCompletedIssues}
              onReset={resetToDefaults}
              variant="toolbar"
            />
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        {renderViewContent()}
      </div>
    </div>
  );
} 