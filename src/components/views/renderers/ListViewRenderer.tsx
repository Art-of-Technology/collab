"use client";

import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Circle, 
  CheckCircle2, 
  XCircle, 
  Pause,
  Play,
  Clock,
  AlertCircle,
  Filter,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ViewFilters from '@/components/views/shared/ViewFilters';
import { IssueDetailModal } from '@/components/issue/IssueDetailModal';

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
  project?: {
    id: string;
    name: string;
    color?: string;
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
}

export default function ListViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser,
  activeFilters,
  setActiveFilters,
  onIssueUpdate
}: ListViewRendererProps) {
  // State management
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [showSubIssues, setShowSubIssues] = useState(true);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
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

  // Filter issues based on selected filters
  const filteredIssues = useMemo(() => {
    let filtered = [...issues];
    
    // Apply assignee filters
    if (selectedFilters.assignees.length > 0) {
      filtered = filtered.filter(issue => {
        const assigneeId = issue.assignee?.id || 'unassigned';
        return selectedFilters.assignees.includes(assigneeId);
      });
    }
    
    // Apply label filters
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
    
    // Apply priority filters
    if (selectedFilters.priority.length > 0) {
      filtered = filtered.filter(issue => {
        const priority = issue.priority || 'no-priority';
        return selectedFilters.priority.includes(priority);
      });
    }
    
    // Apply project filters
    if (selectedFilters.projects.length > 0) {
      filtered = filtered.filter(issue => {
        const projectId = issue.project?.id || 'no-project';
        return selectedFilters.projects.includes(projectId);
      });
    }
    
    return filtered;
  }, [issues, selectedFilters]);

  // Issue handlers
  const handleIssueClick = (issueId: string) => {
    setSelectedIssueId(issueId);
  };

  // Group filtered issues if grouping is enabled
  const groupedIssues = useMemo(() => {
    const groupField = view.grouping?.field;
    
    if (!groupField || groupField === 'none') {
      return [{ name: null, issues: filteredIssues, count: filteredIssues.length }];
    }
    
    const groups = new Map();
    
    filteredIssues.forEach(issue => {
      let groupKey: string;
      let groupName: string;
      
      switch (groupField) {
        case 'status':
          groupKey = issue.status || 'Todo';
          groupName = issue.status || 'Todo';
          break;
        case 'priority':
          groupKey = issue.priority || 'MEDIUM';
          groupName = formatPriority(issue.priority || 'MEDIUM');
          break;
        case 'assignee':
          groupKey = issue.assignee?.id || 'unassigned';
          groupName = issue.assignee?.name || 'Unassigned';
          break;
        case 'type':
          groupKey = issue.type || 'TASK';
          groupName = formatIssueType(issue.type || 'TASK');
          break;
        case 'project':
          groupKey = issue.project?.id || 'no-project';
          groupName = issue.project?.name || 'No Project';
          break;
        default:
          groupKey = 'default';
          groupName = 'All Issues';
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          name: groupName,
          issues: [],
          count: 0
        });
      }
      
      groups.get(groupKey).issues.push(issue);
      groups.get(groupKey).count++;
    });
    
    return Array.from(groups.values());
  }, [filteredIssues, view.grouping]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return '#f43f5e'; // red-500
      case 'HIGH': return '#f97316'; // orange-500
      case 'MEDIUM': return '#eab308'; // yellow-500
      case 'LOW': return '#84cc16'; // lime-500
      default: return '#6b7280'; // gray-500
    }
  };

  const getStatusIcon = (status: string) => {
    const iconClass = "h-4 w-4";
    const normalizedStatus = status?.toLowerCase();
    
    switch (normalizedStatus) {
      case 'todo':
        return <Circle className={cn(iconClass, "text-[#6b7280]")} />;
      case 'in progress':
        return <Play className={cn(iconClass, "text-[#3b82f6]")} fill="currentColor" />;
      case 'done':
        return <CheckCircle2 className={cn(iconClass, "text-[#22c55e]")} fill="currentColor" />;
      case 'cancelled':
        return <XCircle className={cn(iconClass, "text-[#ef4444]")} fill="currentColor" />;
      case 'in review':
        return <Clock className={cn(iconClass, "text-[#a855f7]")} />;
      case 'blocked':
        return <AlertCircle className={cn(iconClass, "text-[#f59e0b]")} />;
      default:
        return <Circle className={cn(iconClass, "text-[#6b7280]")} />;
    }
  };

  const formatPriority = (priority: string): string => {
    switch (priority) {
      case 'URGENT': return 'Urgent';
      case 'HIGH': return 'High';
      case 'MEDIUM': return 'Medium';
      case 'LOW': return 'Low';
      default: return 'Medium';
    }
  };

  const formatIssueType = (type: string): string => {
    switch (type) {
      case 'EPIC': return 'Epic';
      case 'STORY': return 'Story';
      case 'TASK': return 'Task';
      case 'DEFECT': return 'Defect';
      case 'MILESTONE': return 'Milestone';
      case 'SUBTASK': return 'Subtask';
      default: return 'Task';
    }
  };

  const IssueRow = ({ issue }: { issue: Issue }) => (
    <div 
      className="group flex items-center px-6 py-3 hover:bg-[#0f1011] cursor-pointer transition-colors"
      onClick={() => handleIssueClick(issue.id)}
    >
      {/* Priority Indicator */}
      <div className="flex items-center w-6 mr-3">
        <div 
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: getPriorityColor(issue.priority) }}
        />
            </div>

      {/* Status Icon */}
      <div className="flex items-center w-6 mr-3">
        {getStatusIcon(issue.status)}
          </div>

      {/* Issue Key */}
      <div className="w-20 flex-shrink-0 mr-4">
        <span className="text-[#9ca3af] text-sm font-medium">
                      {issue.issueKey}
        </span>
                  </div>
                  
      {/* Issue Title */}
      <div className="flex-1 min-w-0">
        <span className="text-white text-sm block truncate">
                      {issue.title}
        </span>
                </div>

      {/* Project Column (if visible) */}
      {view.fields?.includes('Project') && issue.project && (
        <div className="px-4">
                  <Badge 
            variant="secondary" 
            className="text-xs bg-[#1a1a1a] text-[#9ca3af] border-none"
                  >
            {issue.project.name}
                  </Badge>
                  </div>
                )}

                {/* Assignee */}
      <div className="w-8 flex justify-end">
        {issue.assignee ? (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={issue.assignee.image} />
            <AvatarFallback className="text-xs bg-[#2a2a2a] text-white border-none">
              {issue.assignee.name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
        ) : (
          <div className="h-6 w-6 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <Plus className="h-3 w-3 text-[#666]" />
                  </div>
                )}
                    </div>
                    </div>
  );

  const GroupHeader = ({ group }: { group: any }) => (
    <div className="flex items-center px-6 py-2 bg-[#101011] sticky top-0 z-10">
      <span className="text-[#9ca3af] text-sm font-medium">
        {group.name}
      </span>
      <span className="ml-2 text-[#666] text-sm">
        {group.count}
                      </span>
                    </div>
  );

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
    <div className="h-full bg-[#101011] flex">
      {/* Main List Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#101011] border-b border-[#1f1f1f] px-6 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-white">
              List • {filteredIssues.length} Issues
            </h1>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                className="h-7 px-2 text-xs"
              >
                {isRightSidebarOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="ml-1">Filters</span>
              </Button>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto pb-16">
          {groupedIssues.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Group Header (only show if grouping is enabled) */}
              {group.name && <GroupHeader group={group} />}
              
              {/* Issues */}
              <div>
                {group.issues.map((issue: Issue) => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
                </div>
            </div>
          ))}
        </div>
      </div>

      {/* View Filters Sidebar */}
      <ViewFilters
        issues={issues}
        workspace={workspace}
        isOpen={isRightSidebarOpen}
        onToggle={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        selectedFilters={selectedFilters}
        onFiltersChange={setSelectedFilters}
        showSubIssues={showSubIssues}
        onSubIssuesToggle={() => setShowSubIssues(!showSubIssues)}
        viewType="list"
      />

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