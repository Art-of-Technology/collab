"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Package, Edit, Trash2, MoreHorizontal, CheckSquare, Target, BookOpen, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useDeleteProject } from '@/hooks/queries/useProject';
import { useRouter } from 'next/navigation';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EditProjectDialog } from './EditProjectDialog';
import ProjectBoardsSection from './ProjectBoardsSection';

interface ProjectDetailClientProps {
  project: Project & {
    workspace: {
      id: string;
      name: string;
      slug: string;
    };
    _count: {
      tasks: number;
      epics: number;
      milestones: number;
      stories: number;
      boardProjects: number;
    };
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

export default function ProjectDetailClient({ project, workspaceId }: ProjectDetailClientProps) {
  const router = useRouter();
  const deleteProjectMutation = useDeleteProject();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const handleDeleteProject = async () => {
    try {
      await deleteProjectMutation.mutateAsync(project.id);
      router.push(`/${workspaceId}/projects`);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const hasAssociatedData = (
    project._count.tasks > 0 ||
    project._count.epics > 0 ||
    project._count.milestones > 0 ||
    project._count.stories > 0 ||
    project._count.boardProjects > 0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/${workspaceId}/projects`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Link>
          </Button>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Project Info */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">{project.name}</CardTitle>
                  <CardDescription className="mt-2">
                    {project.description || "No description provided"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Created {format(new Date(project.createdAt), 'MMM d, yyyy')}
                </div>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-4 w-4" />
                  Workspace: {project.workspace.name}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Project Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Project Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <CheckSquare className="h-4 w-4 text-primary mr-1" />
                    <span className="text-2xl font-semibold text-primary">
                      {project._count.tasks}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Tasks</div>
                </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Target className="h-4 w-4 text-blue-600 mr-1" />
                    <span className="text-2xl font-semibold text-blue-600">
                      {project._count.epics}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Epics</div>
                </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Layers className="h-4 w-4 text-purple-600 mr-1" />
                    <span className="text-2xl font-semibold text-purple-600">
                      {project._count.milestones}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Milestones</div>
                </div>
                
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <BookOpen className="h-4 w-4 text-green-600 mr-1" />
                    <span className="text-2xl font-semibold text-green-600">
                      {project._count.stories}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Stories</div>
                </div>
              </div>
              
              {project._count.boardProjects > 0 && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-1">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Connected to {project._count.boardProjects} board{project._count.boardProjects !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Project Boards Management */}
      <ProjectBoardsSection 
        project={project}
        workspaceId={workspaceId}
      />

      {/* Edit Project Dialog */}
      <EditProjectDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        project={project}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{project.name}"? This action cannot be undone.
              {hasAssociatedData && (
                <div className="mt-3 p-3 bg-destructive/10 rounded-md">
                  <p className="text-sm font-medium text-destructive mb-2">
                    This project contains:
                  </p>
                  <ul className="text-sm text-destructive space-y-1">
                    {project._count.tasks > 0 && (
                      <li>• {project._count.tasks} task{project._count.tasks !== 1 ? 's' : ''}</li>
                    )}
                    {project._count.epics > 0 && (
                      <li>• {project._count.epics} epic{project._count.epics !== 1 ? 's' : ''}</li>
                    )}
                    {project._count.milestones > 0 && (
                      <li>• {project._count.milestones} milestone{project._count.milestones !== 1 ? 's' : ''}</li>
                    )}
                    {project._count.stories > 0 && (
                      <li>• {project._count.stories} stor{project._count.stories !== 1 ? 'ies' : 'y'}</li>
                    )}
                    {project._count.boardProjects > 0 && (
                      <li>• {project._count.boardProjects} board connection{project._count.boardProjects !== 1 ? 's' : ''}</li>
                    )}
                  </ul>
                  <p className="text-sm text-destructive mt-2">
                    Please remove or reassign these items before deleting the project.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProjectMutation.isPending}
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}