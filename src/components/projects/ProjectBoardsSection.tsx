"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Unlink, Package, Layout, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import CreateBoardDialog from '@/components/tasks/CreateBoardDialog';

interface ProjectBoardsSectionProps {
  project: Project & {
    boardProjects?: Array<{
      id: string;
      boardId: string;
      board: {
        id: string;
        name: string;
        description: string | null;
      };
    }>;
  };
  workspaceId: string;
}

// Hook to fetch workspace boards
const useWorkspaceBoards = (workspaceId: string) => {
  return useQuery({
    queryKey: ['workspaceBoards', workspaceId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/boards`);
      if (!response.ok) throw new Error('Failed to fetch boards');
      return response.json();
    },
  });
};

// Hook to connect/disconnect boards
const useBoardProjectConnection = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const connectMutation = useMutation({
    mutationFn: async ({ boardId, projectId }: { boardId: string; projectId: string }) => {
      const response = await fetch(`/api/projects/${projectId}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId }),
      });
      if (!response.ok) throw new Error('Failed to connect board');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['workspaceBoards'] });
      toast({ title: "Success", description: "Board connected to project" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to connect board",
        variant: "destructive"
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async ({ boardId, projectId }: { boardId: string; projectId: string }) => {
      const response = await fetch(`/api/projects/${projectId}/boards/${boardId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to disconnect board');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['workspaceBoards'] });
      toast({ title: "Success", description: "Board disconnected from project" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to disconnect board",
        variant: "destructive"
      });
    },
  });

  return { connectMutation, disconnectMutation };
};

export default function ProjectBoardsSection({ project, workspaceId }: ProjectBoardsSectionProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');

  const { data: workspaceBoards } = useWorkspaceBoards(workspaceId);
  const { connectMutation, disconnectMutation } = useBoardProjectConnection();

  // Get boards that are not connected to this project
  const connectedBoardIds = project.boardProjects?.map(bp => bp.boardId) || [];
  const availableBoards = workspaceBoards?.filter((board: any) => 
    !connectedBoardIds.includes(board.id)
  ) || [];

  const handleConnectBoard = () => {
    if (!selectedBoardId) return;
    
    connectMutation.mutate({
      boardId: selectedBoardId,
      projectId: project.id,
    });
    
    setShowConnectDialog(false);
    setSelectedBoardId('');
  };

  const handleDisconnectBoard = (boardId: string) => {
    disconnectMutation.mutate({
      boardId,
      projectId: project.id,
    });
  };

  const handleCreateBoardSuccess = () => {
    setShowCreateDialog(false);
    // The board will be created and can then be connected
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Project Boards
            <Badge variant="secondary">{project.boardProjects?.length || 0}</Badge>
          </CardTitle>
          <div className="flex gap-2">
            {project.boardProjects && project.boardProjects.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link href={`/${workspaceId}/boards/multi-view?project=${project.id}`}>
                  <Layout className="h-4 w-4 mr-2" />
                  Multi-Board View
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConnectDialog(true)}
              disabled={availableBoards.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              Connect Board
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Board
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {project.boardProjects && project.boardProjects.length > 0 ? (
          <div className="space-y-3">
            {project.boardProjects.map((boardProject) => (
              <div
                key={boardProject.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{boardProject.board.name}</h4>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/${workspaceId}/boards?board=${boardProject.board.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                  {boardProject.board.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {boardProject.board.description}
                    </p>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDisconnectBoard(boardProject.boardId)}
                  disabled={disconnectMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Unlink className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="mb-4">No boards connected to this project</p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowConnectDialog(true)}
                disabled={availableBoards.length === 0}
              >
                Connect Existing Board
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                Create New Board
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Create Board Dialog */}
      <CreateBoardDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={handleCreateBoardSuccess}
        initialProjectIds={[project.id]}
      />

      {/* Connect Board Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Board to Project</DialogTitle>
            <DialogDescription>
              Select an existing board to connect to this project.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a board..." />
              </SelectTrigger>
              <SelectContent>
                {availableBoards.map((board: any) => (
                  <SelectItem key={board.id} value={board.id}>
                    <div>
                      <div className="font-medium">{board.name}</div>
                      {board.description && (
                        <div className="text-sm text-muted-foreground">
                          {board.description}
                        </div>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {availableBoards.length === 0 && (
                  <SelectItem value="no-boards" disabled>
                    No available boards to connect
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConnectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConnectBoard}
              disabled={!selectedBoardId || connectMutation.isPending}
            >
              {connectMutation.isPending ? "Connecting..." : "Connect Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}