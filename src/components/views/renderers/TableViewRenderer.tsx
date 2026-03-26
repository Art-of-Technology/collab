"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from "@/components/ui/button";
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  MessageSquare,
  ArrowRight,
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

  const getPriorityDotColor = (priority: string) => {
    switch (priority) {
      case 'URGENT': return 'bg-red-500';
      case 'HIGH': return 'bg-amber-500';
      case 'MEDIUM': return 'bg-blue-500';
      case 'LOW': return 'bg-slate-500';
      default: return 'bg-collab-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'in progress': return 'text-blue-500';
      case 'done': return 'text-green-500';
      case 'review': return 'text-purple-500';
      default: return 'text-collab-400';
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="h-3 w-3" /> : 
      <ChevronDown className="h-3 w-3" />;
  };

  return (
    <div className="h-full">
      {issues.length === 0 ? (
        <div className="py-12 text-center">
          <div
            className="w-full max-w-xs mx-auto h-16 rounded-lg mb-3"
            style={{
              backgroundImage: "radial-gradient(circle, #1f1f22 1px, transparent 1px)",
              backgroundSize: "8px 8px",
            }}
          />
          <p className="text-xs text-collab-500">No issues found</p>
          <p className="text-[10px] text-collab-600 mt-1">Create a new issue or adjust your filters</p>
        </div>
      ) : (
        <div className="rounded-lg border border-collab-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-collab-700 bg-collab-800/60">
                <th
                  className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider cursor-pointer hover:text-collab-300 transition-colors"
                  onClick={() => handleSort('key')}
                >
                  <span className="flex items-center gap-1">Key <SortIcon field="key" /></span>
                </th>
                <th
                  className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider cursor-pointer hover:text-collab-300 transition-colors"
                  onClick={() => handleSort('title')}
                >
                  <span className="flex items-center gap-1">Title <SortIcon field="title" /></span>
                </th>
                <th
                  className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider cursor-pointer hover:text-collab-300 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                </th>
                <th
                  className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider cursor-pointer hover:text-collab-300 transition-colors"
                  onClick={() => handleSort('priority')}
                >
                  <span className="flex items-center gap-1">Priority <SortIcon field="priority" /></span>
                </th>
                <th
                  className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider cursor-pointer hover:text-collab-300 transition-colors"
                  onClick={() => handleSort('assignee')}
                >
                  <span className="flex items-center gap-1">Assignee <SortIcon field="assignee" /></span>
                </th>
                <th
                  className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider cursor-pointer hover:text-collab-300 transition-colors"
                  onClick={() => handleSort('project')}
                >
                  <span className="flex items-center gap-1">Project <SortIcon field="project" /></span>
                </th>
                <th
                  className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider cursor-pointer hover:text-collab-300 transition-colors"
                  onClick={() => handleSort('dueDate')}
                >
                  <span className="flex items-center gap-1">Due <SortIcon field="dueDate" /></span>
                </th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-collab-400 uppercase tracking-wider">
                  Meta
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedIssues.map((issue) => (
                <tr
                  key={issue.id}
                  className="border-b border-collab-700 hover:bg-collab-800/40 transition-colors cursor-pointer group"
                >
                  {/* Key */}
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-mono text-collab-400">{issue.issueKey}</span>
                  </td>

                  {/* Title */}
                  <td className="px-3 py-2.5 max-w-0">
                    <p className="text-[13px] text-collab-50 font-medium truncate group-hover:text-blue-400 transition-colors">
                      {issue.title}
                    </p>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2.5">
                    <Badge
                      className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm bg-collab-700 text-collab-300"
                    >
                      {issue.projectStatus?.displayName || issue.statusValue || issue.status || 'Todo'}
                    </Badge>
                  </td>

                  {/* Priority */}
                  <td className="px-3 py-2.5">
                    {issue.priority && (
                      <div className="flex items-center gap-1.5">
                        <div className={cn("h-2 w-2 rounded-full", getPriorityDotColor(issue.priority))} />
                        <span className="text-xs text-collab-400">{issue.priority}</span>
                      </div>
                    )}
                  </td>

                  {/* Assignee */}
                  <td className="px-3 py-2.5">
                    {issue.assignee ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar user={issue.assignee} size="sm" />
                        <span className="text-[13px] text-collab-50 truncate">{issue.assignee.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-collab-500">Unassigned</span>
                    )}
                  </td>

                  {/* Project */}
                  <td className="px-3 py-2.5">
                    {issue.project && (
                      <Badge
                        className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm"
                        style={{
                          backgroundColor: (issue.project.color || '#6e7681') + '20',
                          color: issue.project.color || '#8b949e'
                        }}
                      >
                        {issue.project.name}
                      </Badge>
                    )}
                  </td>

                  {/* Due Date */}
                  <td className="px-3 py-2.5">
                    {issue.dueDate ? (
                      <span className="text-xs text-collab-400">
                        {new Date(issue.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    ) : (
                      <span className="text-xs text-collab-600">—</span>
                    )}
                  </td>

                  {/* Meta */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-2 text-collab-500">
                      {issue._count?.comments > 0 && (
                        <div className="flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          <span className="text-[10px]">{issue._count.comments}</span>
                        </div>
                      )}
                      {issue._count?.children > 0 && (
                        <div className="flex items-center gap-0.5">
                          <ArrowRight className="h-3 w-3" />
                          <span className="text-[10px]">{issue._count.children}</span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 