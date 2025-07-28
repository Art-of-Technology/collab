"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Grid3X3, Layout, Plus, Minus, Filter, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { TasksProvider } from '@/context/TasksContext';
import KanbanView from '@/components/tasks/KanbanView';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface MultiBoardViewProps {
  workspaceId: string;
  projectId?: string;
  boardIds?: string[];
}

interface ProjectData {
  id: string;
  name: string;
  description?: string;
  boardProjects: Array<{
    id: string;
    boardId: string;
    board: {
      id: string;
      name: string;
      description: string | null;
    };
  }>;
}

interface BoardData {
  id: string;
  name: string;
  description: string | null;
  columns: Array<{
    id: string;
    name: string;
    order: number;
    tasks: Array<{
      id: string;
      title: string;
      type: string;
      priority: string;
      status?: string;
      issueKey?: string;
    }>;
  }>;
}

// Hook to fetch project data
const useProjectData = (workspaceId: string, projectId?: string) => {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch project');
      const data = await response.json();
      return data.project as ProjectData; // API returns { project: {...} }
    },
    enabled: !!projectId,
  });
};

// Hook to fetch multiple boards data
const useBoardsData = (workspaceId: string, boardIds: string[]) => {
  return useQuery({
    queryKey: ['boards', boardIds],
    queryFn: async () => {
      if (!boardIds.length) return [];
      const boardPromises = boardIds.map(async (boardId) => {
        const response = await fetch(`/api/boards/${boardId}/data`);
        if (!response.ok) return null;
        return response.json() as BoardData;
      });
      const results = await Promise.all(boardPromises);
      return results.filter(Boolean) as BoardData[];
    },
    enabled: boardIds.length > 0,
  });
};

export default function MultiBoardView({ workspaceId, projectId, boardIds = [] }: MultiBoardViewProps) {
  const [selectedBoards, setSelectedBoards] = useState<string[]>(boardIds);
  const [viewMode, setViewMode] = useState<'grid' | 'tabs'>('grid');
  const [boardsPerRow, setBoardsPerRow] = useState(2);
  
  const { data: project } = useProjectData(workspaceId, projectId);
  const { data: boardsData } = useBoardsData(workspaceId, selectedBoards);

  // If project is provided, get board IDs from project
  useEffect(() => {
    if (project && !boardIds.length) {
      const projectBoardIds = project.boardProjects.map(bp => bp.boardId);
      setSelectedBoards(projectBoardIds);
    }
  }, [project, boardIds.length]);

  const availableBoards = project?.boardProjects || [];

  const handleBoardToggle = (boardId: string, checked: boolean) => {
    if (checked) {
      setSelectedBoards(prev => [...prev, boardId]);
    } else {
      setSelectedBoards(prev => prev.filter(id => id !== boardId));
    }
  };

  const getGridCols = () => {
    switch (boardsPerRow) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-1 lg:grid-cols-2';
      case 3: return 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3';
      case 4: return 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-4';
      default: return 'grid-cols-1 lg:grid-cols-2';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={projectId ? `/${workspaceId}/projects/${projectId}` : `/${workspaceId}/boards`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {projectId ? 'Back to Project' : 'Back to Boards'}
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {project ? `${project.name} - Multi-Board View` : 'Multi-Board View'}
            </h1>
            {project?.description && (
              <p className="text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'tabs' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('tabs')}
            >
              <Layout className="h-4 w-4" />
            </Button>
          </div>

          {/* Settings */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Multi-Board Settings</SheetTitle>
                <SheetDescription>
                  Customize your multi-board view
                </SheetDescription>
              </SheetHeader>
              
              <div className="space-y-6 mt-6">
                {/* Board Selection */}
                <div className="space-y-3">
                  <h4 className="font-medium">Select Boards</h4>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {availableBoards.map((boardProject) => (
                        <div key={boardProject.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={boardProject.boardId}
                            checked={selectedBoards.includes(boardProject.boardId)}
                            onCheckedChange={(checked) => 
                              handleBoardToggle(boardProject.boardId, checked as boolean)
                            }
                          />
                          <label
                            htmlFor={boardProject.boardId}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {boardProject.board.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* Grid Layout Options */}
                {viewMode === 'grid' && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Grid Layout</h4>
                    <div>
                      <label className="text-sm text-muted-foreground">Boards per row</label>
                      <Select 
                        value={boardsPerRow.toString()} 
                        onValueChange={(value) => setBoardsPerRow(parseInt(value))}
                      >
                        <SelectTrigger className="w-full mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 board per row</SelectItem>
                          <SelectItem value="2">2 boards per row</SelectItem>
                          <SelectItem value="3">3 boards per row</SelectItem>
                          <SelectItem value="4">4 boards per row</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <Badge variant="secondary">
          {selectedBoards.length} board{selectedBoards.length !== 1 ? 's' : ''} selected
        </Badge>
        {boardsData && (
          <Badge variant="outline">
            {boardsData.reduce((total, board) => 
              total + board.columns.reduce((colTotal, col) => colTotal + col.tasks.length, 0), 0
            )} total tasks
          </Badge>
        )}
      </div>

      {/* Content */}
      {selectedBoards.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Layout className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No boards selected</CardTitle>
            <p className="text-muted-foreground mb-4">
              Select one or more boards to view them simultaneously
            </p>
            <Sheet>
              <SheetTrigger asChild>
                <Button>
                  <Filter className="mr-2 h-4 w-4" />
                  Select Boards
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Select Boards</SheetTitle>
                </SheetHeader>
                <div className="space-y-2 mt-6">
                  {availableBoards.map((boardProject) => (
                    <div key={boardProject.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={boardProject.boardId}
                        checked={selectedBoards.includes(boardProject.boardId)}
                        onCheckedChange={(checked) => 
                          handleBoardToggle(boardProject.boardId, checked as boolean)
                        }
                      />
                      <label htmlFor={boardProject.boardId} className="text-sm font-medium">
                        {boardProject.board.name}
                      </label>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </CardContent>
        </Card>
      ) : (
        <div className={`grid gap-6 ${getGridCols()}`}>
          {selectedBoards.map((boardId) => {
            const boardProject = availableBoards.find(bp => bp.boardId === boardId);
            if (!boardProject) return null;

            return (
              <Card key={boardId} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {boardProject.board.name}
                    </CardTitle>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/${workspaceId}/boards?board=${boardId}`}>
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Full View
                      </Link>
                    </Button>
                  </div>
                  {boardProject.board.description && (
                    <p className="text-sm text-muted-foreground">
                      {boardProject.board.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[400px] overflow-hidden">
                    <TasksProvider 
                      workspaceId={workspaceId}
                      initialBoardId={boardId}
                      initialView="kanban"
                    >
                      <div className="scale-75 origin-top-left w-[133%] h-[133%]">
                        <KanbanView />
                      </div>
                    </TasksProvider>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}