"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, X, ArrowUpDown, Circle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Bug, Sparkles, TrendingUp, Calendar, Star, BookOpen, Filter, Tag } from "lucide-react";
import { LabelSelector } from "@/components/ui/label-selector";

export type ItemType = 'TASK' | 'BUG' | 'FEATURE' | 'IMPROVEMENT' | 'MILESTONE' | 'EPIC' | 'STORY' | null;
export type GroupingOption = 'none' | 'type' | 'assignee' | 'milestone' | 'epic' | 'story' | 'labels';
export type SortOption = 'title' | 'id' | 'status' | 'priority';

interface KanbanFiltersProps {
  onSearchChange: (search: string) => void;
  onTypeFilter: (types: ItemType[]) => void;
  onLabelFilter: (labels: string[]) => void;
  onStatusFilter?: (statuses: string[]) => void;
  onGroupingChange: (groupBy: GroupingOption) => void;
  onSortChange?: (field: SortOption, direction: 'asc' | 'desc') => void;
  selectedGrouping: GroupingOption;
  selectedTypes: ItemType[];
  selectedLabels: string[];
  selectedStatuses?: string[];
  selectedSort?: SortOption;
  sortDirection?: 'asc' | 'desc';
  showSortOptions?: boolean;
  showStatusFilter?: boolean;
  availableStatuses?: string[];
  workspaceId: string;
}

export default function KanbanFilters({
  onSearchChange,
  onTypeFilter,
  onLabelFilter,
  onStatusFilter,
  onGroupingChange,
  onSortChange,
  selectedGrouping,
  selectedTypes,
  selectedLabels,
  selectedStatuses,
  selectedSort = 'title',
  sortDirection = 'asc',
  showSortOptions = false,
  showStatusFilter = false,
  availableStatuses,
  workspaceId,
}: KanbanFiltersProps) {
  const [search, setSearch] = useState("");
  
  // Handle search input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    onSearchChange(e.target.value);
  };

  // Toggle item type selection
  const toggleType = (type: ItemType) => {
    if (selectedTypes.includes(type)) {
      onTypeFilter(selectedTypes.filter(t => t !== type));
    } else {
      onTypeFilter([...selectedTypes, type]);
    }
  };

  // Clear all type filters
  const clearTypeFilters = () => {
    onTypeFilter([]);
  };

  // Clear all label filters
  const clearLabelFilters = () => {
    onLabelFilter([]);
  };

  // Toggle status selection
  const toggleStatus = (status: string) => {
    if (!onStatusFilter) return;
    
    const currentStatuses = selectedStatuses || [];
    if (currentStatuses.includes(status)) {
      onStatusFilter(currentStatuses.filter(s => s !== status));
    } else {
      onStatusFilter([...currentStatuses, status]);
    }
  };

  // Clear all status filters
  const clearStatusFilters = () => {
    if (onStatusFilter) {
      onStatusFilter([]);
    }
  };

  // Handle direction change
  const handleDirectionChange = (direction: 'asc' | 'desc') => {
    if (onSortChange && selectedSort) {
      onSortChange(selectedSort, direction);
    }
  };

  // Get type filter count
  const getTypeFilterCount = () => {
    let count = 0;
    if (selectedTypes.length > 0) count++;
    if (search) count++;
    if (selectedGrouping !== 'none') count++;
    return count;
  };

  // Get label filter count
  const getLabelFilterCount = () => {
    return selectedLabels.length;
  };

  // Get status filter count
  const getStatusFilterCount = () => {
    return selectedStatuses?.length || 0;
  };

  return (
    <div className="flex items-center flex-wrap gap-1 sm:gap-1.5 md:gap-2">
      <div className="relative grow max-w-40 sm:max-w-sm md:max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks, epics, stories..."
          className="pl-9 placeholder:text-xs sm:placeholder:text-sm placeholder:text-muted-foreground placeholder:truncate"
          value={search}
          onChange={handleSearchChange}
        />
      </div>

      {/* Type Filter Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Type</span>
            {getTypeFilterCount() > 0 && (
              <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                {getTypeFilterCount()}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Item Types</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={selectedTypes.includes('TASK')}
            onCheckedChange={() => toggleType('TASK')}
          >
            <CheckSquare className="h-4 w-4 mr-2 text-blue-500" />
            Tasks
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={selectedTypes.includes('BUG')}
            onCheckedChange={() => toggleType('BUG')}
          >
            <Bug className="h-4 w-4 mr-2 text-red-500" />
            Bugs
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={selectedTypes.includes('FEATURE')}
            onCheckedChange={() => toggleType('FEATURE')}
          >
            <Sparkles className="h-4 w-4 mr-2 text-green-500" />
            Features
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={selectedTypes.includes('IMPROVEMENT')}
            onCheckedChange={() => toggleType('IMPROVEMENT')}
          >
            <TrendingUp className="h-4 w-4 mr-2 text-purple-500" />
            Improvements
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={selectedTypes.includes('MILESTONE')}
            onCheckedChange={() => toggleType('MILESTONE')}
          >
            <Calendar className="h-4 w-4 mr-2 text-indigo-500" />
            Milestones
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={selectedTypes.includes('EPIC')}
            onCheckedChange={() => toggleType('EPIC')}
          >
            <Star className="h-4 w-4 mr-2 text-purple-500" />
            Epics
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={selectedTypes.includes('STORY')}
            onCheckedChange={() => toggleType('STORY')}
          >
            <BookOpen className="h-4 w-4 mr-2 text-blue-500" />
            Stories
          </DropdownMenuCheckboxItem>

          {selectedTypes.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="p-2">
                <Button 
                  onClick={clearTypeFilters}
                  variant="outline" 
                  size="sm"
                  className="w-full flex items-center justify-center gap-1.5 h-8 text-xs font-medium bg-muted/50 hover:bg-muted border-dashed hover:text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear types</span>
                </Button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Label Filter Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">Labels</span>
            {getLabelFilterCount() > 0 && (
              <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                {getLabelFilterCount()}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Filter by Labels
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="p-2">
            <LabelSelector
              value={selectedLabels}
              onChange={onLabelFilter}
              workspaceId={workspaceId}
              disabled={false}
              placeholder="Select labels to filter..."
            />
          </div>

          {selectedLabels.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="p-2">
                <Button 
                  onClick={clearLabelFilters}
                  variant="outline" 
                  size="sm"
                  className="w-full flex items-center justify-center gap-1.5 h-8 text-xs font-medium bg-muted/50 hover:bg-muted border-dashed hover:text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Clear labels</span>
                </Button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showStatusFilter && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Circle className="h-4 w-4" />
              <span className="hidden sm:inline">Status</span>
              {getStatusFilterCount() > 0 && (
                <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                  {getStatusFilterCount()}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableStatuses && availableStatuses.length > 0 ? (
              availableStatuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={selectedStatuses?.includes(status) || false}
                  onCheckedChange={() => toggleStatus(status)}
                >
                  <Badge variant="outline" className="-ml-4 border-none">
                    {status}
                  </Badge>
                </DropdownMenuCheckboxItem>
              ))
            ) : (
              <div className="p-2 text-sm text-muted-foreground">
                No statuses available
              </div>
            )}

            {(selectedStatuses?.length || 0) > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="p-2">
                  <Button 
                    onClick={clearStatusFilters}
                    variant="outline" 
                    size="sm"
                    className="w-full flex items-center justify-center gap-1.5 h-8 text-xs font-medium bg-muted/50 hover:bg-muted border-dashed hover:text-primary"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Clear statuses</span>
                  </Button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Select
        value={selectedGrouping}
        onValueChange={(value) => onGroupingChange(value as GroupingOption)}
      >
        <SelectTrigger className="w-[140px] sm:w-[160px] md:w-[180px]">
          <SelectValue placeholder="Group" className="text-sm truncate" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No Grouping</SelectItem>
          <SelectItem value="type">Group by Type</SelectItem>
          <SelectItem value="assignee">Group by Assignee</SelectItem>
          <SelectItem value="milestone">Group by Milestone</SelectItem>
          <SelectItem value="epic">Group by Epic</SelectItem>
          <SelectItem value="story">Group by Story</SelectItem>
          <SelectItem value="labels">Group by Labels</SelectItem>
        </SelectContent>
      </Select>

      {showSortOptions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <ArrowUpDown className="h-4 w-4" />
              <Badge variant="secondary" className="px-1">
                {sortDirection === 'asc' ? '↑' : '↓'}
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Sort Options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={selectedSort === 'title'}
              onCheckedChange={() => onSortChange && onSortChange('title', sortDirection)}
            >
              Title
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedSort === 'id'}
              onCheckedChange={() => onSortChange && onSortChange('id', sortDirection)}
            >
              ID
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedSort === 'status'}
              onCheckedChange={() => onSortChange && onSortChange('status', sortDirection)}
            >
              Status
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={selectedSort === 'priority'}
              onCheckedChange={() => onSortChange && onSortChange('priority', sortDirection)}
            >
              Priority
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={sortDirection === 'asc'}
              onCheckedChange={() => handleDirectionChange('asc')}
            >
              Ascending
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={sortDirection === 'desc'}
              onCheckedChange={() => handleDirectionChange('desc')}
            >
              Descending
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
} 