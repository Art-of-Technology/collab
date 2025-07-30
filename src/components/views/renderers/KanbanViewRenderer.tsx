"use client";

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageSquare, 
  ArrowRight,
  Calendar,
  Plus,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KanbanViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
}

export default function KanbanViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser 
}: KanbanViewRendererProps) {

  // Group issues by status
  const statusColumns = useMemo(() => {
    const columns = new Map();
    
    // Default statuses
    const defaultStatuses = ['Todo', 'In Progress', 'Review', 'Done'];
    defaultStatuses.forEach(status => {
      columns.set(status, []);
    });

    // Group issues by status
    issues.forEach(issue => {
      const status = issue.status || 'Todo';
      if (!columns.has(status)) {
        columns.set(status, []);
      }
      columns.get(status).push(issue);
    });

    return Array.from(columns.entries()).map(([status, issues]) => ({
      name: status,
      issues: issues as any[]
    }));
  }, [issues]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'todo': return 'border-gray-600';
      case 'in progress': return 'border-blue-500';
      case 'review': return 'border-purple-500';
      case 'done': return 'border-green-500';
      default: return 'border-gray-600';
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

  return (
    <div className="h-full bg-[#0D1117] p-6">
      <div className="flex gap-6 h-full overflow-x-auto">
        {statusColumns.map((column) => (
          <div
            key={column.name}
            className="flex-shrink-0 w-80 flex flex-col"
          >
            {/* Column Header */}
            <div className={cn(
              "flex items-center justify-between p-4 border-b border-[#21262d] mb-4",
              getStatusColor(column.name)
            )}>
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-white">{column.name}</h3>
                <Badge variant="secondary" className="text-xs bg-[#21262d] text-gray-400 border-0">
                  {column.issues.length}
                </Badge>
              </div>
              <button className="text-gray-400 hover:text-white">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Column Content */}
            <div className="flex-1 space-y-3 overflow-y-auto">
              {column.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={cn(
                    "group p-4 bg-[#161b22] border border-[#21262d] rounded-lg hover:border-[#30363d] transition-all duration-200 cursor-pointer border-l-2",
                    getPriorityColor(issue.priority)
                  )}
                >
                  {/* Issue Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge 
                        variant="outline" 
                        className="text-xs font-mono border-gray-600 text-gray-400"
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
                        {issue.type.toLowerCase()}
                      </Badge>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Issue Title */}
                  <h4 className="text-white font-medium text-sm mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                    {issue.title}
                  </h4>

                  {/* Issue Description */}
                  {issue.description && (
                    <p className="text-gray-500 text-xs mb-3 line-clamp-2">
                      {issue.description}
                    </p>
                  )}

                  {/* Issue Footer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Meta Info */}
                      <div className="flex items-center gap-2 text-gray-500">
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

                        {issue.dueDate && (
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
                    {issue.assignee && (
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={issue.assignee.image} />
                        <AvatarFallback className="text-xs bg-[#21262d] text-gray-400">
                          {issue.assignee.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                  {/* Project Badge */}
                  {issue.project && (
                    <div className="mt-3 pt-3 border-t border-[#21262d]">
                      <Badge 
                        variant="outline" 
                        className="text-xs border-current/20 bg-current/5"
                        style={{ 
                          color: issue.project.color,
                          borderColor: issue.project.color + '40',
                          backgroundColor: issue.project.color + '10'
                        }}
                      >
                        {issue.project.name}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}

              {column.issues.length === 0 && (
                <div className="flex items-center justify-center h-32 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                  <div className="text-center">
                    <Plus className="h-6 w-6 mx-auto mb-2 text-gray-600" />
                    <p className="text-sm">No issues</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 