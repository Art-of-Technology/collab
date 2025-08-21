"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Filter, 
  Plus, 
  CheckSquare, 
  Circle, 
  Clock, 
  AlertTriangle,
  ChevronDown,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';

interface IssuesPageClientProps {
  workspaceId: string;
}

// Mock data for now - this will be replaced with real data fetching
const mockIssues = [
  {
    id: '1',
    key: 'TEST-1',
    title: 'Implement user authentication',
    type: 'TASK',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assignee: {
      name: 'John Doe',
      avatar: null
    },
    project: {
      name: 'Authentication System',
      color: '#22c55e'
    },
    createdAt: '2024-01-15',
    updatedAt: '2024-01-16'
  },
  {
    id: '2', 
    key: 'TEST-2',
    title: 'Fix login page styling',
    type: 'BUG',
    status: 'TODO',
    priority: 'MEDIUM',
    assignee: {
      name: 'Jane Smith',
      avatar: null
    },
    project: {
      name: 'UI Components',
      color: '#3b82f6'
    },
    createdAt: '2024-01-14',
    updatedAt: '2024-01-15'
  }
];

const issueTypeIcons = {
  TASK: CheckSquare,
  BUG: AlertTriangle,
  EPIC: Circle,
  STORY: Circle,
  MILESTONE: Clock,
  SUBTASK: CheckSquare
};

const issueTypeColors = {
  TASK: 'text-blue-500',
  BUG: 'text-red-500',
  EPIC: 'text-purple-500',
  STORY: 'text-green-500',
  MILESTONE: 'text-yellow-500',
  SUBTASK: 'text-gray-500'
};

const priorityColors = {
  URGENT: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-yellow-500',
  LOW: 'bg-green-500'
};

const statusColors = {
  TODO: 'bg-gray-500',
  IN_PROGRESS: 'bg-blue-500',
  IN_REVIEW: 'bg-purple-500',
  DONE: 'bg-green-500',
  CANCELLED: 'bg-red-500'
};

export default function IssuesPageClient({ workspaceId }: IssuesPageClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  const filteredIssues = mockIssues.filter(issue => 
    issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    issue.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateIssue = () => {
    // TODO: Open create issue modal
    console.log('Create new issue');
  };

  const handleIssueClick = (issueId: string) => {
    // TODO: Open issue detail modal or navigate to issue page
    console.log('Open issue:', issueId);
  };

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <div className="border-b border-[#1f1f1f] bg-[#101011] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Issues</h1>
            <p className="text-gray-400 mt-1">Track and manage all your work</p>
          </div>
          <Button
            onClick={handleCreateIssue}
            className="bg-[#22c55e] hover:bg-[#16a34a] text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            New issue
          </Button>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-3 mt-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#1f1f1f] border-[#2a2a2a] focus:border-[#22c55e] text-white placeholder-gray-500"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-[#1f1f1f] border-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]">
                <Filter className="mr-2 h-4 w-4" />
                Filter
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#090909] border-[#1f1f1f]">
              <DropdownMenuItem className="text-gray-300">Status</DropdownMenuItem>
              <DropdownMenuItem className="text-gray-300">Priority</DropdownMenuItem>
              <DropdownMenuItem className="text-gray-300">Assignee</DropdownMenuItem>
              <DropdownMenuItem className="text-gray-300">Project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {filteredIssues.length > 0 ? (
            <div className="space-y-2">
              {filteredIssues.map((issue) => {
                const TypeIcon = issueTypeIcons[issue.type as keyof typeof issueTypeIcons];
                return (
                  <div
                    key={issue.id}
                    className="group flex items-center gap-4 p-3 rounded-lg hover:bg-[#1f1f1f] transition-colors cursor-pointer border border-transparent hover:border-[#2a2a2a]"
                    onClick={() => handleIssueClick(issue.id)}
                  >
                    {/* Issue type and key */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <TypeIcon 
                        className={cn("h-4 w-4 flex-shrink-0", issueTypeColors[issue.type as keyof typeof issueTypeColors])} 
                      />
                      <span className="text-gray-400 font-mono text-sm flex-shrink-0">
                        {issue.key}
                      </span>
                      <span className="text-white truncate">{issue.title}</span>
                    </div>

                    {/* Status */}
                    <Badge 
                      variant="secondary"
                      className={cn(
                        "text-xs text-white border-0",
                        statusColors[issue.status as keyof typeof statusColors]
                      )}
                    >
                      {issue.status.replace('_', ' ')}
                    </Badge>

                    {/* Priority */}
                    <div className="flex items-center gap-2">
                      <div 
                        className={cn(
                          "w-2 h-2 rounded-full",
                          priorityColors[issue.priority as keyof typeof priorityColors]
                        )}
                      />
                      <span className="text-gray-400 text-sm capitalize">{issue.priority.toLowerCase()}</span>
                    </div>

                    {/* Project */}
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: issue.project.color }}
                      />
                      <span className="text-gray-400 text-sm">{issue.project.name}</span>
                    </div>

                    {/* Assignee */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                        <span className="text-xs text-white">
                          {issue.assignee.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <span className="text-gray-400 text-sm">{issue.assignee.name}</span>
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 h-8 w-8 text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-[#090909] border-[#1f1f1f]">
                        <DropdownMenuItem className="text-gray-300">Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-gray-300">Assign</DropdownMenuItem>
                        <DropdownMenuItem className="text-gray-300">Move to project</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-[#1f1f1f]" />
                        <DropdownMenuItem className="text-red-400">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckSquare className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">No issues found</h3>
              <p className="text-gray-500 mb-6">
                {searchQuery ? 'Try adjusting your search terms' : 'Get started by creating your first issue'}
              </p>
              {!searchQuery && (
                <Button
                  onClick={handleCreateIssue}
                  className="bg-[#22c55e] hover:bg-[#16a34a] text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first issue
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 