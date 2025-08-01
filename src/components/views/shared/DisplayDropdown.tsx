"use client";

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Eye,
  ChevronDown
} from 'lucide-react';

const DISPLAY_PROPERTIES = {
  LIST: ['Priority', 'ID', 'Status', 'Labels', 'Project', 'Milestone', 'Due date', 'Links', 'Assignee', 'Created', 'Updated'],
  KANBAN: ['Assignee', 'Priority', 'Labels', 'Due Date', 'Story Points', 'Reporter'],
  TIMELINE: ['Priority', 'Assignee', 'Status', 'Due Date', 'Start Date', 'Progress'],
  TABLE: ['Priority', 'ID', 'Status', 'Labels', 'Project', 'Milestone', 'Due date', 'Links', 'Assignee', 'Created', 'Updated']
};

const GROUPING_OPTIONS = {
  LIST: [
    { id: 'none', name: 'No grouping' },
    { id: 'status', name: 'Status' },
    { id: 'assignee', name: 'Assignee' },
    { id: 'project', name: 'Project' },
    { id: 'priority', name: 'Priority' },
    { id: 'cycle', name: 'Cycle' },
    { id: 'label', name: 'Label' },
    { id: 'parentIssue', name: 'Parent issue' },
    { id: 'team', name: 'Team' }
  ],
  KANBAN: [
    { id: 'status', name: 'Status' },
    { id: 'assignee', name: 'Assignee' },
    { id: 'priority', name: 'Priority' },
  ],
  TIMELINE: [
    { id: 'none', name: 'No grouping' },
    { id: 'project', name: 'Project' },
    { id: 'assignee', name: 'Assignee' },
  ]
};

const ORDERING_OPTIONS = [
  { id: 'manual', name: 'Manual' },
  { id: 'created', name: 'Created' },
  { id: 'updated', name: 'Updated' },
  { id: 'priority', name: 'Priority' },
  { id: 'dueDate', name: 'Due date' },
];

interface DisplayDropdownProps {
  displayType: string;
  grouping: string;
  ordering: string;
  displayProperties: string[];
  showSubIssues?: boolean;
  showEmptyGroups?: boolean;
  completedIssues?: string;
  onDisplayTypeChange?: (type: string) => void;
  onGroupingChange: (grouping: string) => void;
  onOrderingChange: (ordering: string) => void;
  onDisplayPropertiesChange: (properties: string[]) => void;
  onShowSubIssuesChange?: (show: boolean) => void;
  onShowEmptyGroupsChange?: (show: boolean) => void;
  onCompletedIssuesChange?: (setting: string) => void;
  onReset?: () => void;
  variant?: 'modal' | 'toolbar';
}

export default function DisplayDropdown({
  displayType,
  grouping,
  ordering,
  displayProperties,
  showSubIssues = true,
  showEmptyGroups = true,
  completedIssues = 'all',
  onDisplayTypeChange,
  onGroupingChange,
  onOrderingChange,
  onDisplayPropertiesChange,
  onShowSubIssuesChange,
  onShowEmptyGroupsChange,
  onCompletedIssuesChange,
  onReset,
  variant = 'toolbar'
}: DisplayDropdownProps) {
  const isModalVariant = variant === 'modal';
  
  const currentDisplayProperties = DISPLAY_PROPERTIES[displayType as keyof typeof DISPLAY_PROPERTIES] || DISPLAY_PROPERTIES.LIST;
  const currentGroupingOptions = GROUPING_OPTIONS[displayType as keyof typeof GROUPING_OPTIONS] || GROUPING_OPTIONS.LIST;

  const toggleDisplayProperty = (property: string) => {
    const newProperties = displayProperties.includes(property)
      ? displayProperties.filter(p => p !== property)
      : [...displayProperties, property];
    onDisplayPropertiesChange(newProperties);
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
          <Eye className="h-4 w-4 mr-2" />
          Display
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-80 bg-[#090909] border-[#1f1f1f] p-4" 
        align="end"
      >
        {/* Grouping and Ordering Controls */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white font-medium">Grouping</span>
            <Select value={grouping} onValueChange={onGroupingChange}>
              <SelectTrigger className="w-32 h-8 bg-[#1f1f1f] border-[#2a2a2a] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#090909] border-[#1f1f1f]">
                {currentGroupingOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-white focus:bg-[#1f1f1f]">
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-white font-medium">Ordering</span>
            <Select value={ordering} onValueChange={onOrderingChange}>
              <SelectTrigger className="w-32 h-8 bg-[#1f1f1f] border-[#2a2a2a] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#090909] border-[#1f1f1f]">
                {ORDERING_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-white focus:bg-[#1f1f1f]">
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Show completed issues control for toolbar variant */}
          {!isModalVariant && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white font-medium">Completed issues</span>
              <Select value={completedIssues} onValueChange={onCompletedIssuesChange}>
                <SelectTrigger className="w-32 h-8 bg-[#1f1f1f] border-[#2a2a2a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#090909] border-[#1f1f1f]">
                  <SelectItem value="all" className="text-white focus:bg-[#1f1f1f]">All</SelectItem>
                  <SelectItem value="completed" className="text-white focus:bg-[#1f1f1f]">Completed issues</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Toggle options for toolbar variant */}
          {!isModalVariant && onShowSubIssuesChange && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white">Show sub-issues</span>
              <Checkbox
                checked={showSubIssues}
                onCheckedChange={(checked) => onShowSubIssuesChange(checked === true)}
                className="border-[#2a2a2a] data-[state=checked]:bg-[#0969da] data-[state=checked]:border-[#0969da]"
              />
            </div>
          )}

          {!isModalVariant && onShowEmptyGroupsChange && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white">Show empty groups</span>
              <Checkbox
                checked={showEmptyGroups}
                onCheckedChange={(checked) => onShowEmptyGroupsChange(checked === true)}
                className="border-[#2a2a2a] data-[state=checked]:bg-[#0969da] data-[state=checked]:border-[#0969da]"
              />
            </div>
          )}
        </div>

        <div className="border-t border-[#1f1f1f] pt-4">
          <div className="space-y-3">
            <h4 className="text-sm text-white font-medium">
              {displayType === 'LIST' ? 'List' : displayType === 'KANBAN' ? 'Board' : 'Timeline'} options
            </h4>
            <p className="text-sm text-[#999]">Display properties</p>
            
            <div className="grid grid-cols-2 gap-2">
              {currentDisplayProperties.map((property) => (
                <div 
                  key={property}
                  className="flex items-center space-x-2 p-2 rounded hover:bg-[#1f1f1f] cursor-pointer"
                  onClick={() => toggleDisplayProperty(property)}
                >
                  <Checkbox
                    checked={displayProperties.includes(property)}
                    className="border-[#2a2a2a] data-[state=checked]:bg-[#0969da] data-[state=checked]:border-[#0969da]"
                  />
                  <span className="text-sm text-white">{property}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reset and additional actions */}
        {!isModalVariant && (
          <div className="border-t border-[#1f1f1f] pt-4 mt-4">
            <div className="flex justify-between">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onReset}
                className="text-[#666] hover:text-white"
              >
                Reset
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-[#0969da] hover:text-[#0860ca]"
              >
                Set default for everyone
              </Button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
} 