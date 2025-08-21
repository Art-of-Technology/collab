"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Filter,
  Search,
  ChevronDown
} from 'lucide-react';

const FILTER_OPTIONS = [
  { id: 'status', name: 'Status', values: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Cancelled'] },
  { id: 'priority', name: 'Priority', values: ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] },
  { id: 'type', name: 'Issue Type', values: ['EPIC', 'STORY', 'TASK', 'DEFECT', 'MILESTONE', 'SUBTASK'] },
  { id: 'assignee', name: 'Assignee', values: [] },
  { id: 'project', name: 'Project', values: [] },
];

interface FilterDropdownProps {
  selectedFilters: Record<string, string[]>;
  onFilterChange: (filterId: string, value: string, isSelected: boolean) => void;
  variant?: 'modal' | 'toolbar';
  projects?: Array<{ id: string; name: string; color?: string; }>;
}

const formatFilterValue = (value: string): string => {
  switch (value) {
    case 'URGENT': return 'Urgent';
    case 'HIGH': return 'High';
    case 'MEDIUM': return 'Medium';
    case 'LOW': return 'Low';
    case 'EPIC': return 'Epic';
    case 'STORY': return 'Story';
    case 'TASK': return 'Task';
    case 'DEFECT': return 'Bug';
    case 'MILESTONE': return 'Milestone';
    case 'SUBTASK': return 'Subtask';
    default: return value;
  }
};

export default function FilterDropdown({
  selectedFilters,
  onFilterChange,
  variant = 'toolbar',
  projects = []
}: FilterDropdownProps) {
  const [filterSearch, setFilterSearch] = useState('');

  const isModalVariant = variant === 'modal';

  // Add projects to filter options if provided
  const filterOptions = [...FILTER_OPTIONS];
  if (projects.length > 0) {
    const projectOption = filterOptions.find(f => f.id === 'project');
    if (projectOption) {
      projectOption.values = projects.map(p => p.id);
    }
  }

  const handleFilterToggle = (filterId: string, value: string) => {
    const isSelected = selectedFilters[filterId]?.includes(value) || false;
    onFilterChange(filterId, value, !isSelected);
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || projectId;
  };

  const renderFilterValue = (filterId: string, value: string) => {
    if (filterId === 'project') {
      return getProjectName(value);
    }
    return formatFilterValue(value);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isModalVariant ? "outline" : "ghost"}
          size="sm"
          className={isModalVariant 
            ? "h-8 px-3 bg-transparent border-[#2a2a2a] text-white hover:bg-[#1f1f1f]"
            : "h-8 px-3 text-[#666] hover:text-white border border-[#2a2a2a] hover:border-[#3a3a3a]"
          }
        >
          <Filter className="h-4 w-4 mr-2" />
          Filter
          {Object.values(selectedFilters).flat().length > 0 && (
            <span className="ml-2 px-1 py-0.5 bg-[#0969da] text-xs rounded">
              {Object.values(selectedFilters).flat().length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-80 bg-[#090909] border-[#1f1f1f] p-0" 
        align="start"
      >
        <div className="p-3 border-b border-[#1f1f1f]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#666]" />
            <Input
              placeholder="Filter..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="pl-10 bg-[#1f1f1f] border-[#2a2a2a] text-white placeholder-[#666] h-8"
            />
          </div>
        </div>
        
        <div className="p-2 max-h-80 overflow-y-auto">
          <div className="space-y-1">
            {filterOptions
              .filter(category => 
                filterSearch === '' || 
                category.name.toLowerCase().includes(filterSearch.toLowerCase())
              )
              .map((category) => {
                const hasActiveFilters = selectedFilters[category.id]?.length > 0;
                
                return (
                  <DropdownMenu key={category.id}>
                    <DropdownMenuTrigger asChild>
                      <div className="flex items-center gap-3 px-2 py-2 text-white hover:bg-[#1f1f1f] rounded cursor-pointer">
                        <span className="flex-1">{category.name}</span>
                        {hasActiveFilters && (
                          <span className="px-1 py-0.5 bg-[#0969da] text-xs rounded">
                            {selectedFilters[category.id].length}
                          </span>
                        )}
                        <ChevronDown className="h-4 w-4 text-[#666] transform rotate-270" />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      className="w-48 bg-[#090909] border-[#1f1f1f]" 
                      side="right"
                      align="start"
                    >
                      {category.values.map((value) => (
                        <DropdownMenuItem
                          key={value}
                          onClick={() => handleFilterToggle(category.id, value)}
                          className="text-white hover:bg-[#1f1f1f] flex items-center gap-2"
                        >
                          <Checkbox
                            checked={selectedFilters[category.id]?.includes(value) || false}
                            className="border-[#2a2a2a] data-[state=checked]:bg-[#0969da] data-[state=checked]:border-[#0969da]"
                          />
                          {renderFilterValue(category.id, value)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 