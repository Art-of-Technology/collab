"use client";

import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageSquare, 
  ArrowRight,
  Calendar,
  User,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface TableViewRendererProps {
  view: any;
  issues: any[];
  workspace: any;
  currentUser: any;
}

type SortField = 'key' | 'title' | 'status' | 'priority' | 'assignee' | 'project' | 'dueDate';
type SortDirection = 'asc' | 'desc';

export default function TableViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser 
}: TableViewRendererProps) {
  const [sortField, setSortField] = useState<SortField>('key');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedIssues = [...issues].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortField) {
      case 'key':
        aValue = a.issueKey;
        bValue = b.issueKey;
        break;
      case 'title':
        aValue = a.title;
        bValue = b.title;
        break;
      case 'status':
        aValue = a.status || 'Todo';
        bValue = b.status || 'Todo';
        break;
      case 'priority':
        const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
        bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
        break;
      case 'assignee':
        aValue = a.assignee?.name || '';
        bValue = b.assignee?.name || '';
        break;
      case 'project':
        aValue = a.project?.name || '';
        bValue = b.project?.name || '';
        break;
      case 'dueDate':
        aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        break;
      default:
        aValue = a.issueKey;
        bValue = b.issueKey;
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-4 w-4" /> : 
      <ChevronDown className="h-4 w-4" />;
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
          <div className="border border-[#21262d] rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="bg-[#161b22] border-b border-[#21262d]">
              <div className="grid grid-cols-12 gap-4 p-4 text-sm font-medium text-gray-400">
                <button 
                  className="col-span-1 flex items-center gap-2 hover:text-white transition-colors"
                  onClick={() => handleSort('key')}
                >
                  Key
                  <SortIcon field="key" />
                </button>
                
                <button 
                  className="col-span-3 flex items-center gap-2 hover:text-white transition-colors text-left"
                  onClick={() => handleSort('title')}
                >
                  Title
                  <SortIcon field="title" />
                </button>
                
                <button 
                  className="col-span-1 flex items-center gap-2 hover:text-white transition-colors"
                  onClick={() => handleSort('status')}
                >
                  Status
                  <SortIcon field="status" />
                </button>
                
                <button 
                  className="col-span-1 flex items-center gap-2 hover:text-white transition-colors"
                  onClick={() => handleSort('priority')}
                >
                  Priority
                  <SortIcon field="priority" />
                </button>
                
                <button 
                  className="col-span-2 flex items-center gap-2 hover:text-white transition-colors"
                  onClick={() => handleSort('assignee')}
                >
                  Assignee
                  <SortIcon field="assignee" />
                </button>
                
                <button 
                  className="col-span-2 flex items-center gap-2 hover:text-white transition-colors"
                  onClick={() => handleSort('project')}
                >
                  Project
                  <SortIcon field="project" />
                </button>
                
                <button 
                  className="col-span-1 flex items-center gap-2 hover:text-white transition-colors"
                  onClick={() => handleSort('dueDate')}
                >
                  Due Date
                  <SortIcon field="dueDate" />
                </button>
                
                <div className="col-span-1 text-center">
                  Actions
                </div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-[#21262d]">
              {sortedIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="grid grid-cols-12 gap-4 p-4 hover:bg-[#161b22] transition-colors cursor-pointer group"
                >
                  {/* Key */}
                  <div className="col-span-1">
                    <Badge 
                      variant="outline" 
                      className="text-xs font-mono border-gray-600 text-gray-400"
                    >
                      {issue.issueKey}
                    </Badge>
                  </div>

                  {/* Title */}
                  <div className="col-span-3 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "text-xs capitalize",
                          issue.type === 'EPIC' && "bg-purple-500/10 text-purple-400",
                          issue.type === 'STORY' && "bg-blue-500/10 text-blue-400",
                          issue.type === 'TASK' && "bg-green-500/10 text-green-400",
                          issue.type === 'BUG' && "bg-red-500/10 text-red-400"
                        )}
                      >
                        {issue.type.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-white font-medium truncate group-hover:text-blue-400 transition-colors">
                      {issue.title}
                    </p>
                    {issue.description && (
                      <p className="text-sm text-gray-500 truncate mt-1">
                        {issue.description}
                      </p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-span-1">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs border-current/20 bg-current/5",
                        getStatusColor(issue.projectStatus?.displayName || issue.statusValue || issue.status || 'Todo')
                      )}
                    >
                      {issue.projectStatus?.displayName || issue.statusValue || issue.status || 'Todo'}
                    </Badge>
                  </div>

                  {/* Priority */}
                  <div className="col-span-1">
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
                  </div>

                  {/* Assignee */}
                  <div className="col-span-2">
                    {issue.assignee ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={issue.assignee.image} />
                          <AvatarFallback className="text-xs">
                            {issue.assignee.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-white truncate">
                          {issue.assignee.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Unassigned</span>
                    )}
                  </div>

                  {/* Project */}
                  <div className="col-span-2">
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

                  {/* Due Date */}
                  <div className="col-span-1">
                    {issue.dueDate ? (
                      <div className="flex items-center gap-1 text-sm text-gray-400">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(issue.dueDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-center gap-2 text-gray-500">
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 