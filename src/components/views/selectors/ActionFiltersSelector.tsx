"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  History,
  FileText,
  CircleCheck,
  Flag,
  UserCheck,
  Target,
  Calendar,
  Tags,
  Move,
  Play,
  Square,
  ChevronRight,
  Circle,
  Archive,
  CheckCircle2,
  Timer,
  XCircle,
  ArrowDown,
  ArrowUp,
  Minus,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getProjectStatuses } from "@/actions/status";

export interface ActionFilter {
  actionType: string;
  subConditions?: {
    type: 'to' | 'from' | 'by';
    values: string[];
  };
}

interface ActionFiltersSelectorProps {
  value: ActionFilter[];
  onChange: (actions: ActionFilter[]) => void;
  disabled?: boolean;
  projectIds?: string[];
  workspaceMembers?: any[];
}

// Action configuration based on activity types from IssueActivity
const ACTION_OPTIONS = [
  { 
    value: "STATUS_CHANGED", 
    label: "Status changed", 
    icon: CircleCheck, 
    color: "text-green-500", 
    hasSubConditions: true,
    subConditionType: "to"
  },
  { 
    value: "PRIORITY_CHANGED", 
    label: "Priority changed", 
    icon: Flag, 
    color: "text-amber-500",
    hasSubConditions: true,
    subConditionType: "to"
  },
  { 
    value: "ASSIGNED", 
    label: "Assigned", 
    icon: UserCheck, 
    color: "text-purple-500",
    hasSubConditions: true,
    subConditionType: "to"
  },
  { value: "DESCRIPTION_UPDATED", label: "Description changed", icon: FileText, color: "text-blue-500" },
  { value: "TITLE_UPDATED", label: "Title changed", icon: FileText, color: "text-blue-400" },
  { value: "UNASSIGNED", label: "Unassigned", icon: UserCheck, color: "text-gray-500" },
  { value: "TYPE_CHANGED", label: "Type changed", icon: Target, color: "text-cyan-500" },
  { value: "LABELS_CHANGED", label: "Labels changed", icon: Tags, color: "text-pink-500" },
  { value: "DUE_DATE_CHANGED", label: "Due date changed", icon: Calendar, color: "text-orange-400" },
];

// Priority options for sub-conditions
const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", icon: ArrowDown, color: "text-slate-500" },
  { value: "MEDIUM", label: "Medium", icon: Minus, color: "text-blue-600" },
  { value: "HIGH", label: "High", icon: ArrowUp, color: "text-amber-600" },
  { value: "URGENT", label: "Urgent", icon: Flag, color: "text-red-600" },
];

function getActionConfig(action: string) {
  return ACTION_OPTIONS.find(a => a.value === action) || ACTION_OPTIONS[0];
}

export function ActionFiltersSelector({
  value = [],
  onChange,
  disabled = false,
  projectIds = [],
  workspaceMembers = []
}: ActionFiltersSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  // Fetch statuses for sub-conditions
  const { data: statuses = [], isLoading: isStatusesLoading } = useQuery({
    queryKey: ['statuses', projectIds],
    queryFn: () => getProjectStatuses(projectIds),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: projectIds.length > 0
  });

  // Create unique statuses map using ID as key to ensure lookup by ID works correctly
  const uniqueStatuses = Array.from(new Map(statuses.map(s => [s.id, s])).values());

  const statusIcon = (status: any) => {
    const iconMap = {
      'circle': Circle,
      'archive': Archive,
      'check-circle-2': CheckCircle2,
      'timer': Timer,
      'x-circle': XCircle,
    }
    const Icon = iconMap[status.iconName as keyof typeof iconMap] || iconMap['circle'];
    return <Icon className={cn("h-3.5 w-3.5")} style={{ color: status.color }} />;
  };

  const selectedActions = value.map(v => getActionConfig(v.actionType));

  const toggleAction = (actionType: string) => {
    const actionConfig = getActionConfig(actionType);
    const existingFilter = value.find(v => v.actionType === actionType);
    
    if (existingFilter) {
      // Remove the action filter
      onChange(value.filter(v => v.actionType !== actionType));
    } else if (!actionConfig.hasSubConditions) {
      // Only add action filter if it doesn't have sub-conditions
      // Actions with sub-conditions should only be created when sub-options are selected
      const newFilter: ActionFilter = {
        actionType
      };
      onChange([...value, newFilter]);
    }
    // If action has sub-conditions, don't create a filter - just expand/collapse
  };

  const updateSubCondition = (actionType: string, subValues: string[]) => {
    const actionConfig = getActionConfig(actionType);
    const existingFilter = value.find(v => v.actionType === actionType);
    
    if (subValues.length === 0) {
      // Remove the filter if no sub-conditions are selected
      if (existingFilter) {
        onChange(value.filter(v => v.actionType !== actionType));
      }
    } else {
      // Create or update the filter with sub-conditions
      if (existingFilter) {
        // Update existing filter
        const newFilters = value.map(filter => {
          if (filter.actionType === actionType) {
            return {
              ...filter,
              subConditions: {
                type: actionConfig.subConditionType as 'to' | 'from' | 'by',
                values: subValues
              }
            };
          }
          return filter;
        });
        onChange(newFilters);
      } else {
        // Create new filter with sub-conditions
        const newFilter: ActionFilter = {
          actionType,
          subConditions: {
            type: actionConfig.subConditionType as 'to' | 'from' | 'by',
            values: subValues
          }
        };
        onChange([...value, newFilter]);
      }
    }
  };

  // Helper to get display text for an action filter
  const getActionDisplayText = (filter: ActionFilter) => {
    const config = getActionConfig(filter.actionType);
    if (!filter.subConditions || filter.subConditions.values.length === 0) {
      return config.label;
    }
    
    if (filter.actionType === 'STATUS_CHANGED') {
      const statusNames = filter.subConditions.values.map(id => {
        const status = uniqueStatuses.find(s => s.id === id);
        return status?.displayName || status?.name || id;
      });
      return `${config.label} to ${statusNames.slice(0, 2).join(', ')}${statusNames.length > 2 ? '...' : ''}`;
    }
    
    if (filter.actionType === 'PRIORITY_CHANGED') {
      const priorities = filter.subConditions.values.map(p => {
        const priority = PRIORITY_OPTIONS.find(pr => pr.value === p);
        return priority?.label || p;
      });
      return `${config.label} to ${priorities.slice(0, 2).join(', ')}${priorities.length > 2 ? '...' : ''}`;
    }
    
    if (filter.actionType === 'ASSIGNED') {
      const assigneeNames = filter.subConditions.values.map(id => {
        const member = workspaceMembers.find(m => m.id === id);
        return member?.name || id;
      });
      return `${config.label} to ${assigneeNames.slice(0, 2).join(', ')}${assigneeNames.length > 2 ? '...' : ''}`;
    }
    
    return config.label;
  };

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {value.length === 0 ? (
            <>
              <History className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Actions</span>
            </>
          ) : value.length === 1 ? (
            <>
              {(() => {
                const Icon = selectedActions[0].icon;
                const colorClass = selectedActions[0].color;
                return <Icon className={cn("h-3 w-3", colorClass)} />;
              })()}
              <span className="text-[#cccccc] text-xs">{getActionDisplayText(value[0])}</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                {selectedActions.slice(0, 2).map((action, index) => {
                  const Icon = action.icon;
                  const colorClass = action.color;
                  return <Icon key={action.value} className={cn("h-2.5 w-2.5", colorClass)} />;
                })}
                {selectedActions.length > 2 && (
                  <div className="h-2.5 w-2.5 rounded-full bg-[#404040] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{value.length} actions</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-80 p-1 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="text-xs text-[#9ca3af] px-2 py-1.5 border-b border-[#2d2d30] mb-1 font-medium">
          Filter by actions
        </div>
        
        <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent space-y-0.5">
          {/* Clear all option */}
          <Button
            type="button"
            variant="ghost"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
            onClick={() => onChange([])}
          >
            <History className="h-3.5 w-3.5 text-[#6e7681]" />
            <span className="text-[#9ca3af] flex-1">Clear actions filter</span>
            {value.length === 0 && (
              <span className="text-xs text-[#6e7681]">✓</span>
            )}
          </Button>
          
          {ACTION_OPTIONS.map((action) => {
            const Icon = action.icon;
            const colorClass = action.color;
            const isSelected = value.some(v => v.actionType === action.value);
            const selectedFilter = value.find(v => v.actionType === action.value);
            const isExpanded = expandedAction === action.value;
            
            return (
              <div key={action.value} className="space-y-0.5">
                {/* Main action button */}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                  onClick={() => {
                    if (!action.hasSubConditions) {
                      // Actions without sub-conditions work as normal toggle
                      toggleAction(action.value);
                    } else {
                      // Actions with sub-conditions only expand/collapse
                      setExpandedAction(isExpanded ? null : action.value);
                    }
                  }}
                >
                  <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                  <span className="text-[#cccccc] flex-1">{action.label}</span>
                  {action.hasSubConditions && (
                    <ChevronRight className={cn(
                      "h-3 w-3 transition-transform text-[#6e7681]",
                      isExpanded && "rotate-90"
                    )} />
                  )}
                  {isSelected && (!action.hasSubConditions || (selectedFilter?.subConditions?.values.length || 0) > 0) && (
                    <span className="text-xs text-[#6e7681]">✓</span>
                  )}
                </Button>

                {/* Sub-conditions */}
                {action.hasSubConditions && isExpanded && (
                  <div className="ml-6 space-y-0.5 border-l border-[#2d2d30] pl-2">
                    <div className="text-[10px] text-[#6e7681] px-2 py-1 uppercase tracking-wide">
                      {action.subConditionType} what?
                    </div>
                    
                    {action.value === 'STATUS_CHANGED' && (
                      <div className="space-y-0.5">
                        {isStatusesLoading ? (
                          <div className="flex items-center gap-1 px-2 py-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="text-[#6e7681] text-xs">Loading...</span>
                          </div>
                        ) : uniqueStatuses.length > 0 ? (
                          uniqueStatuses.map((status) => {
                            const isSubSelected = selectedFilter?.subConditions?.values.includes(status.id) || false;
                            return (
                              <Button
                                key={status.id}
                                type="button"
                                variant="ghost"
                                className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                                onClick={() => {
                                  const currentValues = selectedFilter?.subConditions?.values || [];
                                  const newValues = isSubSelected
                                    ? currentValues.filter(v => v !== status.id)
                                    : [...currentValues, status.id];
                                  updateSubCondition(action.value, newValues);
                                }}
                              >
                                {statusIcon(status)}
                                <span className="text-[#cccccc] flex-1">{status.displayName}</span>
                                {isSubSelected && (
                                  <span className="text-xs text-[#6e7681]">✓</span>
                                )}
                              </Button>
                            );
                          })
                        ) : (
                          <div className="text-[#6e7681] text-xs px-2 py-1">
                            No statuses available. Select projects first.
                          </div>
                        )}
                      </div>
                    )}

                    {action.value === 'PRIORITY_CHANGED' && (
                      <div className="space-y-0.5">
                        {PRIORITY_OPTIONS.map((priority) => {
                          const isSubSelected = selectedFilter?.subConditions?.values.includes(priority.value) || false;
                          const Icon = priority.icon;
                          return (
                            <Button
                              key={priority.value}
                              type="button"
                              variant="ghost"
                              className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                              onClick={() => {
                                const currentValues = selectedFilter?.subConditions?.values || [];
                                const newValues = isSubSelected
                                  ? currentValues.filter(v => v !== priority.value)
                                  : [...currentValues, priority.value];
                                updateSubCondition(action.value, newValues);
                              }}
                            >
                              <Icon className={cn("h-3.5 w-3.5", priority.color)} />
                              <span className="text-[#cccccc] flex-1">{priority.label}</span>
                              {isSubSelected && (
                                <span className="text-xs text-[#6e7681]">✓</span>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    {action.value === 'ASSIGNED' && (
                      <div className="space-y-0.5">
                        {workspaceMembers.length > 0 ? (
                          workspaceMembers.map((member) => {
                            const isSubSelected = selectedFilter?.subConditions?.values.includes(member.id) || false;
                            return (
                              <Button
                                key={member.id}
                                type="button"
                                variant="ghost"
                                className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
                                onClick={() => {
                                  const currentValues = selectedFilter?.subConditions?.values || [];
                                  const newValues = isSubSelected
                                    ? currentValues.filter(v => v !== member.id)
                                    : [...currentValues, member.id];
                                  updateSubCondition(action.value, newValues);
                                }}
                              >
                                <div className="w-3.5 h-3.5 rounded-full bg-purple-500 flex items-center justify-center">
                                  <span className="text-[10px] text-white font-medium">
                                    {member.name?.charAt(0).toUpperCase() || '?'}
                                  </span>
                                </div>
                                <span className="text-[#cccccc] flex-1">{member.name || member.email}</span>
                                {isSubSelected && (
                                  <span className="text-xs text-[#6e7681]">✓</span>
                                )}
                              </Button>
                            );
                          })
                        ) : (
                          <div className="text-[#6e7681] text-xs px-2 py-1">
                            No workspace members available.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
