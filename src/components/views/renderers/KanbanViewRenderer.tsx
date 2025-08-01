"use client";

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageSquare, 
  ArrowRight,
  Calendar,
  Plus,
  MoreHorizontal,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KanbanViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
  activeFilters?: Record<string, string[]>;
  setActiveFilters?: (filters: Record<string, string[]>) => void;
}

export default function KanbanViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser 
}: KanbanViewRendererProps) {

  // Group issues by the specified field (default to status)
  const columns = useMemo(() => {
    const groupField = view.grouping?.field || 'status';
    const columnsMap = new Map();
    
    // Define default columns based on grouping field
    let defaultColumns: string[] = [];
    switch (groupField) {
      case 'status':
        defaultColumns = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'];
        break;
      case 'priority':
        defaultColumns = ['Urgent', 'High', 'Medium', 'Low'];
        break;
      case 'type':
        defaultColumns = ['Epic', 'Story', 'Task', 'Defect', 'Milestone', 'Subtask'];
        break;
      case 'assignee':
        // Dynamic assignee columns will be created based on issues
        break;
      default:
        defaultColumns = ['Todo', 'In Progress', 'Done'];
    }
    
    // Initialize default columns
    defaultColumns.forEach(column => {
      columnsMap.set(column, []);
    });

    // Group issues
    issues.forEach(issue => {
      let groupValue: string;
      
      switch (groupField) {
        case 'status':
          groupValue = issue.status || 'Todo';
          break;
        case 'priority':
          groupValue = issue.priority === 'URGENT' ? 'Urgent' :
                      issue.priority === 'HIGH' ? 'High' :
                      issue.priority === 'MEDIUM' ? 'Medium' :
                      issue.priority === 'LOW' ? 'Low' :
                      'Medium';
          break;
        case 'assignee':
          groupValue = issue.assignee?.name || 'Unassigned';
          break;
        case 'type':
          groupValue = issue.type === 'EPIC' ? 'Epic' : 
                      issue.type === 'STORY' ? 'Story' :
                      issue.type === 'TASK' ? 'Task' :
                      issue.type === 'DEFECT' ? 'Defect' :
                      issue.type === 'MILESTONE' ? 'Milestone' :
                      issue.type === 'SUBTASK' ? 'Subtask' :
                      'Task';
          break;
        default:
          groupValue = issue.status || 'Todo';
      }
      
      if (!columnsMap.has(groupValue)) {
        columnsMap.set(groupValue, []);
      }
      columnsMap.get(groupValue).push(issue);
    });

    return Array.from(columnsMap.entries()).map(([name, issues]) => ({
      name,
      issues: issues as any[]
    }));
  }, [issues, view.grouping]);

  const getColumnColor = (columnName: string, groupField: string) => {
    switch (groupField) {
      case 'status':
        switch (columnName.toLowerCase()) {
          case 'backlog': return 'border-gray-600';
      case 'todo': return 'border-gray-600';
      case 'in progress': return 'border-blue-500';
          case 'in review': return 'border-purple-500';
      case 'done': return 'border-green-500';
      default: return 'border-gray-600';
        }
      case 'priority':
        switch (columnName.toLowerCase()) {
          case 'urgent': return 'border-red-500';
          case 'high': return 'border-orange-500';
          case 'medium': return 'border-yellow-500';
          case 'low': return 'border-green-500';
          default: return 'border-gray-600';
        }
      case 'type':
        switch (columnName.toLowerCase()) {
          case 'epic': return 'border-purple-500';
          case 'story': return 'border-blue-500';
          case 'task': return 'border-green-500';
          case 'defect': return 'border-red-500';
          case 'milestone': return 'border-indigo-500';
          case 'subtask': return 'border-cyan-500';
          default: return 'border-gray-600';
        }
      default:
        return 'border-gray-600';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'border-l-red-500';
      case 'HIGH': return 'border-l-orange-500';
      case 'MEDIUM': return 'border-l-yellow-500';
      case 'LOW': return 'border-l-green-500';
      default: return 'border-l-gray-600';
    }
  };

  const displayProperties = view.fields || ['Priority', 'Status', 'Assignee'];

  return (
    <div className="h-full bg-[#101011] p-6">
      {issues.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-[#999]">
          <div className="text-center">
            <Plus className="h-12 w-12 mx-auto mb-4 text-[#666]" />
            <p className="text-base">No issues found in this board</p>
            <p className="text-sm text-[#666] mt-1">
              Create a new issue or adjust your filters
            </p>
          </div>
        </div>
      ) : (
      <div className="flex gap-6 h-full overflow-x-auto">
          {columns.map((column) => (
          <div
            key={column.name}
            className="flex-shrink-0 w-80 flex flex-col"
          >
            {/* Column Header */}
            <div className={cn(
                "flex items-center justify-between p-4 border-b-2 mb-4",
                getColumnColor(column.name, view.grouping?.field || 'status')
            )}>
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-white">{column.name}</h3>
                  <Badge variant="secondary" className="text-xs bg-[#1f1f1f] text-[#999] border-0">
                  {column.issues.length}
                </Badge>
              </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-6 w-6 text-[#666] hover:text-white"
                >
                <Plus className="h-4 w-4" />
                </Button>
            </div>

            {/* Column Content */}
            <div className="flex-1 space-y-3 overflow-y-auto">
              {column.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={cn(
                      "group p-4 bg-[#090909] border border-[#1f1f1f] rounded-lg hover:border-[#2a2a2a] transition-all duration-200 cursor-pointer border-l-2",
                    getPriorityColor(issue.priority)
                  )}
                >
                  {/* Issue Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
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
                           issue.type === 'DEFECT' ? 'Defect' :
                           issue.type === 'MILESTONE' ? 'Milestone' :
                           issue.type === 'SUBTASK' ? 'Subtask' :
                           issue.type?.toLowerCase()}
                      </Badge>
                    </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#666] hover:text-white transition-opacity"
                      >
                      <MoreHorizontal className="h-4 w-4" />
                      </Button>
                  </div>

                  {/* Issue Title */}
                    <h4 className="text-white font-medium text-sm mb-2 line-clamp-2 group-hover:text-[#0969da] transition-colors">
                    {issue.title}
                  </h4>

                  {/* Issue Description */}
                  {issue.description && (
                      <p className="text-[#666] text-xs mb-3 line-clamp-2">
                      {issue.description}
                    </p>
                  )}

                    {/* Dynamic Properties */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Meta Info */}
                        <div className="flex items-center gap-2 text-[#666]">
                        {issue._count?.comments > 0 && (
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            <span className="text-xs">{issue._count.comments}</span>
                          </div>
                        )}
                        
                        {issue._count?.children > 0 && (
                          <div className="flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" />
                            <span className="text-xs">{issue._count.children}</span>
                          </div>
                        )}

                          {displayProperties.includes('Due Date') && issue.dueDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className="text-xs">
                              {new Date(issue.dueDate).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Assignee */}
                      {displayProperties.includes('Assignee') && (
                        <div className="flex items-center">
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
                      )}
                    </div>

                    {/* Additional Properties */}
                    <div className="mt-3 flex items-center justify-between">
                      {/* Priority (if enabled) */}
                      {displayProperties.includes('Priority') && issue.priority && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs border-current/20 bg-current/10",
                            issue.priority === 'URGENT' && "text-red-400 border-red-400/20",
                            issue.priority === 'HIGH' && "text-orange-400 border-orange-400/20",
                            issue.priority === 'MEDIUM' && "text-yellow-400 border-yellow-400/20",
                            issue.priority === 'LOW' && "text-green-400 border-green-400/20"
                          )}
                        >
                          {issue.priority === 'URGENT' ? 'Urgent' :
                           issue.priority === 'HIGH' ? 'High' :
                           issue.priority === 'MEDIUM' ? 'Medium' :
                           issue.priority === 'LOW' ? 'Low' :
                           issue.priority}
                        </Badge>
                      )}

                      {/* Story Points (if enabled) */}
                      {displayProperties.includes('Story Points') && issue.storyPoints && (
                        <Badge variant="secondary" className="text-xs bg-[#1f1f1f] text-[#999] border-0">
                          {issue.storyPoints} pts
                        </Badge>
                    )}
                  </div>

                  {/* Project Badge */}
                  {issue.project && (
                      <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
                      <Badge 
                        variant="outline" 
                          className="text-xs border-current/20 bg-current/10"
                        style={{ 
                            color: issue.project.color || '#6b7280',
                            borderColor: (issue.project.color || '#6b7280') + '40',
                        }}
                      >
                        {issue.project.name}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}

              {column.issues.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-[#666] border-2 border-dashed border-[#2a2a2a] rounded-lg hover:border-[#0969da] transition-colors">
                  <div className="text-center">
                      <Plus className="h-6 w-6 mx-auto mb-2 text-[#666]" />
                    <p className="text-sm">No issues</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
} 