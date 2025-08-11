"use client";

import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Circle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertCircle,
  Filter,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ArrowRight,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';
import { getIssuePriorityBadge, getIssueTypeBadge, formatIssueDateShort } from '@/utils/issueHelpers';
import { format } from 'date-fns';

interface Issue {
  id: string;
  title: string;
  issueKey: string;
  type: string;
  priority: string;
  status: string;
  description?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  assignee?: {
    id: string;
    name: string;
    image?: string;
  };
  assigneeId?: string;
  reporter?: {
    id: string;
    name: string;
    image?: string;
  };
  project?: {
    id: string;
    name: string;
    color?: string;
  };
  projectId?: string;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  _count?: {
    comments?: number;
    children?: number;
  };
}

interface ListViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
  activeFilters?: Record<string, string[]>;
  setActiveFilters?: (filters: Record<string, string[]>) => void;
  onIssueUpdate?: (issueId: string, updates: any) => void;
  displayProperties?: string[];
  showSubIssues?: boolean;
}

// Status normalization map - same as kanban to avoid duplicate columns
const STATUS_NORMALIZATION_MAP: Record<string, string> = {
  'todo': 'Todo',
  'to do': 'Todo',
  'to_do': 'Todo',
  'ready': 'Todo',
  'backlog': 'Backlog',
  'in progress': 'In Progress',
  'in_progress': 'In Progress',
  'inprogress': 'In Progress',
  'active': 'In Progress',
  'working': 'In Progress',
  'doing': 'In Progress',
  'development': 'In Progress',
  'review': 'Review',
  'in review': 'Review',
  'in_review': 'Review',
  'reviewing': 'Review',
  'testing': 'Testing',
  'test': 'Testing',
  'qa': 'Testing',
  'done': 'Done',
  'completed': 'Done',
  'finished': 'Done',
  'resolved': 'Done',
  'closed': 'Done',
  'cancelled': 'Cancelled',
  'canceled': 'Cancelled',
  'rejected': 'Cancelled',
  'blocked': 'Blocked',
  'blocker': 'Blocked',
  'stuck': 'Blocked'
};

const normalizeStatus = (status: string): string => {
  if (!status) return 'Todo';
  const normalized = STATUS_NORMALIZATION_MAP[status.toLowerCase()];
  return normalized || status;
};

export default function ListViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser,
  activeFilters,
  setActiveFilters,
  onIssueUpdate,
  displayProperties = ['ID', 'Priority', 'Status', 'Assignee', 'Project', 'Due date'],
  showSubIssues = true
}: ListViewRendererProps) {
  // State management
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [hoveredIssueId, setHoveredIssueId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedFilters, setSelectedFilters] = useState<{
    assignees: string[];
    labels: string[];
    priority: string[];
    projects: string[];
  }>({
    assignees: [],
    labels: [],
    priority: [],
    projects: []
  });

  // Display settings - use props from parent (view.fields comes from tempDisplayProperties in ViewRenderer)
  const displaySettings = {
    grouping: view.grouping?.field || 'status',
    ordering: view.ordering || 'updated',
    displayProperties: view.fields || displayProperties || ['ID', 'Priority', 'Labels', 'Project', 'Assignee'],
    showSubIssues: showSubIssues
  };



  // Filter and group issues
  const groupedIssues = useMemo(() => {
    let filtered = [...issues];
    
    // Apply filters
    if (selectedFilters.assignees.length > 0) {
      filtered = filtered.filter(issue => {
        const assigneeId = issue.assignee?.id || 'unassigned';
        return selectedFilters.assignees.includes(assigneeId);
      });
    }
    
    if (selectedFilters.labels.length > 0) {
      filtered = filtered.filter(issue => {
        if (!issue.labels || issue.labels.length === 0) {
          return selectedFilters.labels.includes('no-labels');
        }
        return issue.labels.some((label: any) => 
          selectedFilters.labels.includes(label.id)
        );
      });
    }
    
    if (selectedFilters.priority.length > 0) {
      filtered = filtered.filter(issue => {
        const priority = issue.priority || 'no-priority';
        return selectedFilters.priority.includes(priority);
      });
    }
    
    if (selectedFilters.projects.length > 0) {
      filtered = filtered.filter(issue => {
        const projectId = issue.project?.id || 'no-project';
        return selectedFilters.projects.includes(projectId);
      });
    }

    // Group issues
    const groups = new Map<string, { name: string; issues: Issue[]; count: number }>();
    
    filtered.forEach(issue => {
      let groupKey: string;
      let groupName: string;
      
      switch (displaySettings.grouping) {
        case 'status':
          groupKey = normalizeStatus(issue.status || 'Todo');
          groupName = groupKey;
          break;
        case 'priority':
          groupKey = issue.priority || 'MEDIUM';
          groupName = getIssuePriorityBadge(issue.priority).label;
          break;
        case 'assignee':
          groupKey = issue.assignee?.id || 'unassigned';
          groupName = issue.assignee?.name || 'Unassigned';
          break;
        case 'project':
          groupKey = issue.project?.id || 'no-project';
          groupName = issue.project?.name || 'No Project';
          break;
        default:
          groupKey = 'all';
          groupName = 'All Issues';
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          name: groupName,
          issues: [],
          count: 0
        });
      }
      
      groups.get(groupKey)!.issues.push(issue);
      groups.get(groupKey)!.count++;
    });

    // Sort issues within each group
    groups.forEach(group => {
      group.issues.sort((a, b) => {
        switch (displaySettings.ordering) {
          case 'created':
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case 'updated':
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          case 'priority': {
            const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
            const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
            return bPriority - aPriority;
          }
          case 'dueDate': {
            const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return aDate - bDate;
          }
          default:
            return a.title.localeCompare(b.title);
        }
      });
    });
    
    return Array.from(groups.values());
  }, [issues, selectedFilters, displaySettings]);

  // Handlers
  const handleIssueClick = (issueId: string) => {
    setSelectedIssueId(issueId);
  };

  const handleGroupToggle = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };



  // Optimized issue update to prevent infinite loops
  const handleIssueUpdate = async (issueId: string, field: string, value: any) => {
    if (onIssueUpdate) {
      await onIssueUpdate(issueId, { [field]: value });
    }
  };

  // Helper components
  const getPriorityIcon = (priority: string) => {
    const priorityConfig = getIssuePriorityBadge(priority);
    const IconComponent = priorityConfig.icon;
    
    // Color mapping for better visibility
    const colorMap = {
      'URGENT': 'text-red-500',
      'HIGH': 'text-orange-500', 
      'MEDIUM': 'text-blue-500',
      'LOW': 'text-green-500'
    };
    
    const colorClass = colorMap[priority as keyof typeof colorMap] || 'text-gray-500';
    
    return <IconComponent className={cn("h-3.5 w-3.5", colorClass)} />;
  };

  const getStatusIcon = (status: string) => {
    const normalizedStatus = normalizeStatus(status).toLowerCase();
    const iconClass = "h-3.5 w-3.5";
    
    switch (normalizedStatus) {
      case 'todo':
        return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
      case 'in progress':
        return <Clock className={cn(iconClass, "text-[#3b82f6]")} />;
      case 'review':
        return <Clock className={cn(iconClass, "text-[#f59e0b]")} />;
      case 'testing':
        return <Clock className={cn(iconClass, "text-[#8b5cf6]")} />;
      case 'done':
        return <CheckCircle2 className={cn(iconClass, "text-[#22c55e]")} fill="currentColor" />;
      case 'cancelled':
        return <XCircle className={cn(iconClass, "text-[#ef4444]")} fill="currentColor" />;
      case 'blocked':
        return <AlertCircle className={cn(iconClass, "text-[#f59e0b]")} />;
      default:
        return <Circle className={cn(iconClass, "text-[#8b949e]")} />;
    }
  };

  // Group Header Component
  const GroupHeader = ({ group, groupKey }: { group: any; groupKey: string }) => {
    const isCollapsed = collapsedGroups.has(groupKey);
    
    return (
      <div 
        className="sticky top-0 z-20 bg-[#101011] border-b border-[#1f1f1f] cursor-pointer"
        onClick={() => handleGroupToggle(groupKey)}
      >
        <div className="flex items-center gap-2 px-6 py-3 hover:bg-[#0f1011] transition-colors">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-[#8b949e]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#8b949e]" />
          )}
          <div className="flex items-center gap-2">
            {displaySettings.grouping === 'status' && getStatusIcon(group.name)}
            <span className="text-[#e6edf3] text-sm font-medium">{group.name}</span>
            <span className="text-[#8b949e] text-xs">{group.count}</span>
          </div>
        </div>
      </div>
    );
  };

  // Issue Row Component - Linear style
  const IssueRow = ({ issue }: { issue: Issue }) => (
    <div 
      className={cn(
        "group flex items-center px-6 py-2 border-b border-[#1f1f1f] transition-all duration-150 cursor-pointer",
        "hover:bg-[#0f1011] hover:border-[#333]",
        hoveredIssueId === issue.id && "bg-[#0f1011]"
      )}
      onMouseEnter={() => setHoveredIssueId(issue.id)}
      onMouseLeave={() => setHoveredIssueId(null)}
      onClick={() => handleIssueClick(issue.id)}
    >
      {/* Status Icon */}
      <div className="flex items-center w-6 mr-3 flex-shrink-0">
        {getStatusIcon(issue.status)}
      </div>

      {/* Issue Key */}
      {displaySettings.displayProperties.includes('ID') && (
        <div className="w-20 flex-shrink-0 mr-3">
          <span className="text-[#8b949e] text-xs font-mono font-medium">
            {issue.issueKey}
          </span>
        </div>
      )}

      {/* Priority and Title section */}
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          {/* Priority Icon */}
          {displaySettings.displayProperties.includes('Priority') && issue.priority && (
            <div className="flex items-center flex-shrink-0">
              {getPriorityIcon(issue.priority)}
            </div>
          )}
          
          {/* Title */}
          <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors">
            {issue.title}
          </span>
        </div>
        
        {/* Labels - shown on same line in Linear style */}
        {displaySettings.displayProperties.includes('Labels') && issue.labels && issue.labels.length > 0 && (
          <div className="flex gap-1 mt-0.5">
            {issue.labels.slice(0, 2).map((label) => (
              <Badge 
                key={label.id}
                className="h-3.5 px-1 text-[9px] font-medium leading-none border-0 rounded-sm"
                style={{ 
                  backgroundColor: label.color + '20',
                  color: label.color || '#8b949e'
                }}
              >
                {label.name}
              </Badge>
            ))}
            {issue.labels.length > 2 && (
              <span className="text-[9px] text-[#6e7681] px-1">+{issue.labels.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Project, Due Date, and Meta section */}
      <div className="flex items-center gap-2 flex-shrink-0 mr-4">
        {/* Project Badge */}
        {displaySettings.displayProperties.includes('Project') && issue.project && (
          <Badge 
            className="h-5 px-2 text-[10px] font-medium leading-none border-0 rounded-md bg-opacity-80 hover:bg-opacity-100 transition-all"
            style={{ 
              backgroundColor: (issue.project.color || '#6e7681') + '30',
              color: issue.project.color || '#8b949e'
            }}
          >
            {issue.project.name}
          </Badge>
        )}

        {/* Due Date */}
        {displaySettings.displayProperties.includes('Due date') && issue.dueDate && (
          <Badge className="h-5 px-2 text-[10px] font-medium leading-none bg-orange-500/30 text-orange-400 border-0 rounded-md hover:bg-orange-500/40 transition-all">
            {format(new Date(issue.dueDate), 'MMM d')}
          </Badge>
        )}

        {/* Comments Meta */}
        {displaySettings.displayProperties.includes('Comments') && (
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-500/20 text-gray-400 rounded-md">
            <MessageSquare className="h-3 w-3" />
            <span className="text-[10px] font-medium">{issue._count?.comments || 0}</span>
          </div>
        )}

        {/* Sub-issues Meta */}
        {displaySettings.displayProperties.includes('Sub-issues') && (
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-md">
            <ArrowRight className="h-3 w-3" />
            <span className="text-[10px] font-medium">{issue._count?.children || 0}</span>
          </div>
        )}
      </div>

      {/* Assignee */}
      {displaySettings.displayProperties.includes('Assignee') && (
        <div className="flex items-center w-8 mr-3 flex-shrink-0">
          {issue.assignee ? (
            <Avatar className="h-6 w-6">
              <AvatarImage src={issue.assignee.image} />
              <AvatarFallback className="text-xs bg-[#2a2a2a] text-white border-none">
                {issue.assignee.name?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-6 w-6 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
              <User className="h-3 w-3 text-[#666]" />
            </div>
          )}
        </div>
      )}

      {/* Updated Date */}
      {displaySettings.displayProperties.includes('Updated') && (
        <div className="flex-shrink-0 w-12">
          <span className="text-[#6e7681] text-xs">
            {format(new Date(issue.updatedAt), 'MMM d')}
          </span>
        </div>
      )}


    </div>
  );

  // Calculate total issues count
  const totalIssues = groupedIssues.reduce((sum, group) => sum + group.count, 0);

  // Empty state component
  if (issues.length === 0) {
    return (
      <div className="h-full bg-[#101011] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
            <Plus className="h-6 w-6 text-[#666]" />
          </div>
          <p className="text-[#9ca3af] text-sm">No issues found</p>
          <p className="text-[#666] text-xs mt-1">
            Adjust your filters or create a new issue
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#101011] flex flex-col overflow-hidden">
      {/* Grouped List Content */}
      <div className="flex-1 overflow-auto">
        {totalIssues === 0 ? (
          <div className="flex items-center justify-center h-64 text-[#8b949e]">
            <div className="text-center">
              <Filter className="h-8 w-8 mx-auto mb-2 text-[#6e7681]" />
              <p className="text-sm">No issues match your filters</p>
              <p className="text-xs text-[#6e7681] mt-1">
                Try adjusting your filter criteria
              </p>
            </div>
          </div>
        ) : (
          <div>
            {groupedIssues.map((group, index) => {
              const groupKey = `${displaySettings.grouping}-${group.name}`;
              const isCollapsed = collapsedGroups.has(groupKey);
              
              return (
                <div key={groupKey}>
                  {/* Group Header - only show if not "all" grouping */}
                  {displaySettings.grouping !== 'none' && (
                    <GroupHeader group={group} groupKey={groupKey} />
                  )}
                  
                  {/* Group Issues */}
                  {!isCollapsed && (
                    <div>
                      {group.issues.map((issue: Issue) => (
                        <IssueRow key={issue.id} issue={issue} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Issue Detail Modal */}
      {selectedIssueId && (
        <IssueDetailModal
          issueId={selectedIssueId}
          onClose={() => setSelectedIssueId(null)}
        />
      )}
    </div>
  );
} 