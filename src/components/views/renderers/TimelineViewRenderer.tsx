"use client";

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Calendar,
  Clock,
  Plus,
  MoreHorizontal,
  Flag,
  User,
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
  startDate?: string;
  dueDate?: string;
  progress?: number;
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

interface TimelineViewRendererProps {
  view: any;
  issues: Issue[];
  workspace: any;
  currentUser: any;
  activeFilters?: Record<string, string[]>;
  setActiveFilters?: (filters: Record<string, string[]>) => void;
  onIssueUpdate?: (issueId: string, updates: any) => void;
}

export default function TimelineViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser,
  activeFilters,
  setActiveFilters,
  onIssueUpdate
}: TimelineViewRendererProps) {
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

  // Group filtered issues by project or assignee based on view grouping
  const groupedIssues = useMemo(() => {
    const groupField = view.grouping?.field || 'none';
    
    if (groupField === 'none') {
      return [{ name: 'All Issues', issues: filteredIssues, color: '#6b7280' }];
    }
    
    const groups = new Map();
    
    filteredIssues.forEach(issue => {
      let groupKey: string;
      let groupName: string;
      let groupColor: string;
      
      switch (groupField) {
        case 'project':
          groupKey = issue.project?.id || 'no-project';
          groupName = issue.project?.name || 'No Project';
          groupColor = issue.project?.color || '#6b7280';
          break;
        case 'assignee':
          groupKey = issue.assignee?.id || 'unassigned';
          groupName = issue.assignee?.name || 'Unassigned';
          groupColor = '#6b7280';
          break;
        default:
          groupKey = 'default';
          groupName = 'All Issues';
          groupColor = '#6b7280';
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          name: groupName,
          color: groupColor,
          issues: []
        });
      }
      
      groups.get(groupKey).issues.push(issue);
    });
    
    return Array.from(groups.values());
  }, [filteredIssues, view.grouping]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-500';
      case 'HIGH': return 'bg-orange-500';
      case 'MEDIUM': return 'bg-yellow-500';
      case 'LOW': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getTimelineDuration = (issue: any) => {
    const startDate = issue.startDate ? new Date(issue.startDate) : new Date();
    const endDate = issue.dueDate ? new Date(issue.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 1 week
    
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      startDate,
      endDate,
      duration: diffDays,
      width: Math.max(80, Math.min(300, diffDays * 20)) // Min 80px, max 300px
    };
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  return (
    <div className="h-full bg-[#101011] flex">
      {/* Main Timeline Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#101011] border-b border-[#1f1f1f] px-6 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-white">
              Timeline • {filteredIssues.length} Issues
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

        {filteredIssues.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#999]">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-[#666]" />
              <p className="text-base">No issues found in this timeline</p>
              <p className="text-sm text-[#666] mt-1">
                Create a new issue or adjust your filters
              </p>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-auto p-6">
          {/* Timeline Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Timeline View</h2>
              <div className="flex items-center gap-2 text-sm text-[#999]">
                <Clock className="h-4 w-4" />
                <span>Showing {issues.length} issues</span>
              </div>
            </div>
          </div>

          {/* Timeline Content */}
          <div className="space-y-8">
            {groupedIssues.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-4">
                {/* Group Header */}
                {groupedIssues.length > 1 && (
                  <div className="flex items-center gap-3 mb-4">
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: group.color }}
                    />
                    <h3 className="text-base font-medium text-white">{group.name}</h3>
                    <Badge variant="secondary" className="text-xs bg-[#1f1f1f] text-[#999] border-0">
                      {group.issues.length}
                    </Badge>
                  </div>
                )}

                                 {/* Timeline Items */}
                 <div className="space-y-3">
                   {group.issues.map((issue: Issue) => {
                    const timeline = getTimelineDuration(issue);
                    
                    return (
                      <div
                        key={issue.id}
                        className="group relative flex items-center gap-4 p-4 bg-[#090909] border border-[#1f1f1f] rounded-lg hover:border-[#2a2a2a] transition-all duration-200 cursor-pointer"
                        onClick={() => handleIssueClick(issue.id)}
                      >
                        {/* Issue Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge 
                              variant="outline" 
                              className="text-xs font-mono border-[#2a2a2a] text-[#999]"
                            >
                              {issue.issueKey}
                            </Badge>
                            <Badge 
                              variant="secondary" 
                              className={cn(
                                "text-xs capitalize",
                                issue.type === 'EPIC' && "bg-purple-500/10 text-purple-400",
                                issue.type === 'STORY' && "bg-blue-500/10 text-blue-400",
                                issue.type === 'TASK' && "bg-green-500/10 text-green-400",
                                issue.type === 'DEFECT' && "bg-red-500/10 text-red-400"
                              )}
                            >
                              {issue.type === 'EPIC' ? 'Epic' : 
                                issue.type === 'STORY' ? 'Story' :
                                issue.type === 'TASK' ? 'Task' :
                                issue.type === 'DEFECT' ? 'Bug' :
                                issue.type === 'MILESTONE' ? 'Milestone' :
                                issue.type === 'SUBTASK' ? 'Subtask' :
                                issue.type?.toLowerCase()}
                            </Badge>
                            <div 
                              className={cn(
                                "w-2 h-2 rounded-full",
                                getPriorityColor(issue.priority)
                              )}
                              title={`${issue.priority} priority`}
                            />
                          </div>
                          
                          <h4 className="text-white font-medium text-sm mb-1 line-clamp-1 group-hover:text-[#0969da] transition-colors">
                            {issue.title}
                          </h4>
                          
                          <div className="flex items-center gap-3 text-xs text-[#666]">
                            <span>{formatDate(timeline.startDate)}</span>
                            <span>→</span>
                            <span>{formatDate(timeline.endDate)}</span>
                            <span>({timeline.duration} days)</span>
                          </div>
                        </div>

                        {/* Timeline Bar */}
                        <div className="flex-shrink-0 relative">
                          <div 
                            className="h-6 bg-[#0969da]/20 border border-[#0969da]/40 rounded flex items-center justify-between px-2"
                            style={{ width: `${timeline.width}px` }}
                          >
                            <div className="text-xs text-white font-medium truncate">
                              {issue.progress ? `${issue.progress}%` : ''}
                            </div>
                            {issue.progress && (
                              <div 
                                className="absolute left-0 top-0 h-full bg-[#0969da]/60 rounded"
                                style={{ width: `${issue.progress}%` }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Assignee */}
                        <div className="flex items-center gap-2">
                          {issue.assignee ? (
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={issue.assignee.image} />
                              <AvatarFallback className="text-xs bg-[#1f1f1f] text-[#999]">
                                {issue.assignee.name?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-[#1f1f1f] flex items-center justify-center">
                              <User className="h-3 w-3 text-[#666]" />
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#666] hover:text-white transition-opacity"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Add New Issue in Group */}
                {groupedIssues.length > 1 && (
                  <Button
                    variant="ghost"
                    className="w-full h-12 border-2 border-dashed border-[#2a2a2a] text-[#666] hover:text-white hover:border-[#0969da] transition-colors"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add issue to {group.name}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Timeline Footer */}
          <div className="mt-8 pt-4 border-t border-[#1f1f1f]">
            <div className="flex items-center justify-between text-sm text-[#666]">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  <span>Urgent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full" />
                  <span>High</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span>Medium</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span>Low</span>
                </div>
              </div>
              <div className="text-[#666]">
                Timeline spans {Math.ceil(issues.length * 1.5)} days
              </div>
            </div>
          </div>
        </div>
        )}
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
        viewType="timeline"
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