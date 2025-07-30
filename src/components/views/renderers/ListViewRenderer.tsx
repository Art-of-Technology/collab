"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ArrowRight, 
  MessageSquare, 
  Paperclip,
  Calendar,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ListViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
}

export default function ListViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser 
}: ListViewRendererProps) {

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'text-red-500';
      case 'HIGH': return 'text-orange-500';
      case 'MEDIUM': return 'text-yellow-500';
      case 'LOW': return 'text-green-500';
      default: return 'text-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'in progress': return 'text-blue-500';
      case 'done': return 'text-green-500';
      case 'review': return 'text-purple-500';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="h-full bg-[#0D1117]">
      <div className="p-6">
        {issues.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <User className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No issues found in this view</p>
              <p className="text-sm text-gray-600 mt-1">
                Create a new issue or adjust your filters
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="group flex items-center gap-4 p-4 rounded-lg border border-[#21262d] bg-[#0D1117] hover:bg-[#161b22] hover:border-[#30363d] transition-all duration-200 cursor-pointer"
              >
                {/* Issue Key & Type */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
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
                        issue.type === 'EPIC' && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                        issue.type === 'STORY' && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                        issue.type === 'TASK' && "bg-green-500/10 text-green-400 border-green-500/20",
                        issue.type === 'DEFECT' && "bg-red-500/10 text-red-400 border-red-500/20"
                      )}
                    >
                      {issue.type.toLowerCase()}
                    </Badge>
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium truncate group-hover:text-blue-400 transition-colors">
                      {issue.title}
                    </p>
                    {issue.description && (
                      <p className="text-sm text-gray-500 truncate mt-1">
                        {issue.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs border-current/20 bg-current/5",
                      getStatusColor(issue.status)
                    )}
                  >
                    {issue.status || 'Todo'}
                  </Badge>
                </div>

                {/* Priority */}
                {issue.priority && (
                  <div className="flex items-center gap-1">
                    <div 
                      className={cn(
                        "h-2 w-2 rounded-full",
                        getPriorityColor(issue.priority)
                      )}
                    />
                    <span className={cn(
                      "text-xs font-medium",
                      getPriorityColor(issue.priority)
                    )}>
                      {issue.priority}
                    </span>
                  </div>
                )}

                {/* Assignee */}
                {issue.assignee && (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={issue.assignee.image} />
                      <AvatarFallback className="text-xs">
                        {issue.assignee.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                {/* Meta Info */}
                <div className="flex items-center gap-3 text-gray-500">
                  {issue._count?.comments > 0 && (
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs">{issue._count.comments}</span>
                    </div>
                  )}
                  
                  {issue._count?.children > 0 && (
                    <div className="flex items-center gap-1">
                      <ArrowRight className="h-4 w-4" />
                      <span className="text-xs">{issue._count.children}</span>
                    </div>
                  )}

                  {issue.dueDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span className="text-xs">
                        {new Date(issue.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Project Badge */}
                {issue.project && (
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 