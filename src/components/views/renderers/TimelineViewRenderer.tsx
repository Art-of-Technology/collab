"use client";

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { 
  Calendar,
  Clock,
  Plus,
  MoreHorizontal,
  Flag,
  Filter,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
      filtered = filtered.filter((issue: any) => {
        if (!issue.labels || issue.labels.length === 0) {
          return selectedFilters.labels.includes('no-labels');
        }
        return issue.labels.some((label: any) => selectedFilters.labels.includes(label.id));
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
      default: return 'bg-collab-500';
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
    <div className="h-full bg-collab-900 flex">
      {/* Main Timeline Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-collab-900/95 backdrop-blur-sm border-b border-collab-700 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-collab-50">Timeline</span>
              <span className="text-xs text-collab-500">{filteredIssues.length} issues</span>
            </div>
            
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
          <div className="flex-1 flex items-center justify-center">
            <div className="py-12 text-center">
              <div
                className="w-full max-w-xs mx-auto h-16 rounded-lg mb-3"
                style={{
                  backgroundImage: "radial-gradient(circle, #1f1f22 1px, transparent 1px)",
                  backgroundSize: "8px 8px",
                }}
              />
              <p className="text-xs text-collab-500">No issues in this timeline</p>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-auto p-6">

          {/* Timeline Content */}
          <div className="space-y-8">
            {groupedIssues.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-4">
                {/* Group Header */}
                {groupedIssues.length > 1 && (
                  <div className="flex items-center gap-2 mb-4">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="text-xs font-medium uppercase tracking-wider text-collab-400">{group.name}</span>
                    <Badge variant="secondary" className="h-4 text-[10px] bg-collab-700 text-collab-400 border-0">
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
                        className="group relative flex items-center gap-4 p-3 bg-collab-800 border border-collab-700 rounded-xl hover:bg-collab-700 hover:border-collab-600 transition-all duration-150 cursor-pointer"
                        onClick={() => handleIssueClick(issue.id)}
                      >
                        {/* Issue Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-mono text-collab-400">{issue.issueKey}</span>
                            <Badge 
                              className={cn(
                                "h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm capitalize",
                                issue.type === 'EPIC' && "bg-purple-500/10 text-purple-400",
                                issue.type === 'STORY' && "bg-blue-500/10 text-blue-400",
                                issue.type === 'TASK' && "bg-green-500/10 text-green-400",
                                issue.type === 'BUG' && "bg-red-500/10 text-red-400"
                              )}
                            >
                              {issue.type?.toLowerCase()}
                            </Badge>
                            <div 
                              className={cn("w-2 h-2 rounded-full", getPriorityColor(issue.priority))}
                              title={`${issue.priority} priority`}
                            />
                          </div>
                          
                          <h4 className="text-[13px] text-collab-50 font-medium mb-1 line-clamp-1 group-hover:text-blue-400 transition-colors">
                            {issue.title}
                          </h4>
                          
                          <div className="flex items-center gap-3 text-[10px] text-collab-500">
                            <span>{formatDate(timeline.startDate)}</span>
                            <span>→</span>
                            <span>{formatDate(timeline.endDate)}</span>
                            <span>({timeline.duration} days)</span>
                          </div>
                        </div>

                        {/* Timeline Bar */}
                        <div className="flex-shrink-0 relative">
                          <div 
                            className="h-5 bg-blue-500/15 border border-blue-500/30 rounded-md flex items-center justify-between px-2"
                            style={{ width: `${timeline.width}px` }}
                          >
                            <div className="text-xs text-white font-medium truncate">
                              {issue.progress ? `${issue.progress}%` : ''}
                            </div>
                            {issue.progress && (
                              <div 
                                className="absolute left-0 top-0 h-full bg-blue-500/40 rounded-md"
                                style={{ width: `${issue.progress}%` }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Assignee */}
                        <div className="flex items-center gap-2">
                        <UserAvatar user={issue.assignee} size="sm" />
                        </div>

                        {/* Actions */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-collab-500 hover:text-white transition-opacity"
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
                    className="w-full h-9 border border-dashed border-collab-700 text-collab-500 hover:text-collab-300 hover:border-collab-600 transition-colors rounded-lg"
                  >
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    Add issue to {group.name}
                  </Button>
                )}
              </div>
            ))}
          </div>

        </div>
        )}
      </div>

      {/* View Filters Sidebar */}
      <ViewFilters
        issues={issues}
        workspace={workspace}
        currentUser={currentUser}
        isOpen={isRightSidebarOpen}
        onToggle={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
        selectedFilters={selectedFilters}
        onFiltersChange={setSelectedFilters}
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