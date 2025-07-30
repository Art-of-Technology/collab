"use client";

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Plus, 
  Settings,
  Kanban,
  List,
  Table,
  Calendar,
  BarChart3,
  Star,
  Share,
  Edit,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import KanbanViewRenderer from './renderers/KanbanViewRenderer';
import ListViewRenderer from './renderers/ListViewRenderer';
import TableViewRenderer from './renderers/TableViewRenderer';

interface ViewRendererProps {
  view: {
    id: string;
    name: string;
    description?: string;
    type: string;
    displayType: string;
    visibility: string;
    color?: string;
    issueCount: number;
    filters: any;
    projects: Array<{
      id: string;
      name: string;
      slug: string;
      issuePrefix: string;
      color?: string;
    }>;
    isDefault: boolean;
    isFavorite: boolean;
    createdBy: string;
    sharedWith: string[];
    createdAt: Date;
    updatedAt: Date;
  };
  issues: any[];
  workspace: any;
  currentUser: any;
}

const VIEW_TYPE_ICONS = {
  KANBAN: Kanban,
  LIST: List,
  TABLE: Table,
  CALENDAR: Calendar,
  TIMELINE: BarChart3,
  GANTT: BarChart3,
  BOARD: Kanban
};

export default function ViewRenderer({ 
  view, 
  issues, 
  workspace, 
  currentUser 
}: ViewRendererProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Filter issues based on search
  const filteredIssues = useMemo(() => {
    if (!searchQuery) return issues;
    
    return issues.filter(issue => 
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [issues, searchQuery]);

  const ViewIcon = VIEW_TYPE_ICONS[view.displayType as keyof typeof VIEW_TYPE_ICONS] || Kanban;

  const handleFavoriteToggle = async () => {
    try {
      const response = await fetch(`/api/views/${view.id}/favorite`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh the page to update the favorite status
        window.location.reload();
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const renderViewContent = () => {
    switch (view.displayType) {
      case 'KANBAN':
      case 'BOARD':
        return (
          <KanbanViewRenderer
            view={view}
            issues={filteredIssues}
            workspace={workspace}
            currentUser={currentUser}
          />
        );
      case 'LIST':
        return (
          <ListViewRenderer
            view={view}
            issues={filteredIssues}
            workspace={workspace}
            currentUser={currentUser}
          />
        );
      case 'TABLE':
        return (
          <TableViewRenderer
            view={view}
            issues={filteredIssues}
            workspace={workspace}
            currentUser={currentUser}
          />
        );
      case 'CALENDAR':
        // TODO: Implement calendar view
        return (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>Calendar view coming soon</p>
            </div>
          </div>
        );
      case 'TIMELINE':
      case 'GANTT':
        // TODO: Implement timeline view
        return (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>BarChart3 view coming soon</p>
            </div>
          </div>
        );
      default:
        return (
          <KanbanViewRenderer
            view={view}
            issues={filteredIssues}
            workspace={workspace}
            currentUser={currentUser}
          />
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0D1117]">
      {/* View Header */}
      <div className="border-b border-[#21262d] bg-[#0D1117] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ViewIcon 
              className="h-5 w-5 text-gray-400" 
              style={{ color: view.color }} 
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-white">{view.name}</h1>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleFavoriteToggle}
                  className={cn(
                    "h-6 w-6",
                    view.isFavorite ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"
                  )}
                >
                  <Star 
                    className="h-4 w-4" 
                    fill={view.isFavorite ? "currentColor" : "none"} 
                  />
                </Button>
                {view.type !== 'SYSTEM' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-gray-400 hover:text-white"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="start"
                      className="bg-[#1c2128] border-[#30363d] text-gray-200"
                    >
                      <DropdownMenuItem className="hover:bg-[#21262d]">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit View
                      </DropdownMenuItem>
                      <DropdownMenuItem className="hover:bg-[#21262d]">
                        <Share className="h-4 w-4 mr-2" />
                        Share View
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#30363d]" />
                      <DropdownMenuItem className="hover:bg-[#21262d] text-red-400">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete View
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {view.description && (
                <p className="text-sm text-gray-400 mt-1">{view.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge 
                  variant="secondary" 
                  className="text-xs bg-[#21262d] text-gray-400 border-0"
                >
                  {filteredIssues.length} {filteredIssues.length === 1 ? 'issue' : 'issues'}
                </Badge>
                {view.projects.length > 0 && (
                  <div className="flex items-center gap-1">
                    {view.projects.slice(0, 3).map((project) => (
                      <Badge 
                        key={project.id}
                        variant="outline" 
                        className="text-xs border-current/20"
                        style={{ 
                          color: project.color,
                          backgroundColor: `${project.color}10`
                        }}
                      >
                        {project.name}
                      </Badge>
                    ))}
                    {view.projects.length > 3 && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs bg-[#21262d] text-gray-400 border-0"
                      >
                        +{view.projects.length - 3} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64 bg-[#21262d] border-[#30363d] text-gray-200 placeholder-gray-400 focus:border-blue-500"
              />
            </div>

            {/* Filter */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="text-gray-400 hover:text-white hover:bg-[#21262d]"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>

            {/* New Issue */}
            <Button
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Issue
            </Button>

            {/* View Settings */}
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white hover:bg-[#21262d]"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        {renderViewContent()}
      </div>
    </div>
  );
} 