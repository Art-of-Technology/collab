"use client";

import { useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Plus, Calendar, Package, MoreHorizontal, Trash2, Edit, Loader2, Share2, Layout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useProjects, useDeleteProject } from '@/hooks/queries/useProject';
import { useWorkspace } from '@/context/WorkspaceContext';
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
import { CreateProjectDialog } from './CreateProjectDialog';
import { EditProjectDialog } from './EditProjectDialog';
import CreateBoardDialog from '@/components/tasks/CreateBoardDialog';
import ShareProjectDialog from './ShareProjectDialog';

interface ProjectListProps {
  workspaceId: string;
}

export default function ProjectList({ workspaceId }: ProjectListProps) {
  const { data: projects, isLoading, error } = useProjects(workspaceId);
  const deleteProjectMutation = useDeleteProject();
  
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateBoardDialog, setShowCreateBoardDialog] = useState(false);
  const [selectedProjectForBoard, setSelectedProjectForBoard] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedProjectForShare, setSelectedProjectForShare] = useState<Project | null>(null);
  
  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    
    await deleteProjectMutation.mutateAsync(projectToDelete.id);
    setProjectToDelete(null);
  };

  const handleCreateBoardForProject = (projectId: string) => {
    setSelectedProjectForBoard(projectId);
    setShowCreateBoardDialog(true);
  };

  const handleBoardCreated = () => {
    setShowCreateBoardDialog(false);
    setSelectedProjectForBoard(null);
  };

  const handleShareProject = (project: Project) => {
    setSelectedProjectForShare(project);
    setShowShareDialog(true);
  };

  const handleShareDialogClose = () => {
    setShowShareDialog(false);
    setSelectedProjectForShare(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Error loading projects: {error.message}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Organize your work into projects for better management
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Project
        </Button>
      </div>

      {!projects?.length ? (
        <Card className="text-center py-12">
          <CardContent>
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No projects yet</CardTitle>
            <CardDescription className="mb-4">
              Create your first project to start organizing your tasks and epics.
            </CardDescription>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1 line-clamp-1">
                      {project.name}
                    </CardTitle>
                    {project.description && (
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setProjectToEdit(project)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleCreateBoardForProject(project.id)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Board
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShareProject(project)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share Project
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setProjectToDelete(project)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="pb-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {project._count && (
                    <>
                      <div className="text-center">
                        <div className="text-2xl font-semibold text-primary">
                          {project._count.tasks}
                        </div>
                        <div className="text-xs text-muted-foreground">Tasks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-semibold text-blue-600">
                          {project._count.epics}
                        </div>
                        <div className="text-xs text-muted-foreground">Epics</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-semibold text-purple-600">
                          {project._count.milestones}
                        </div>
                        <div className="text-xs text-muted-foreground">Milestones</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-semibold text-green-600">
                          {project._count.stories}
                        </div>
                        <div className="text-xs text-muted-foreground">Stories</div>
                      </div>
                    </>
                  )}
                </div>

                {project._count?.boardProjects > 0 && (
                  <div className="flex items-center gap-1 mb-3">
                    <Package className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Connected to {project._count.boardProjects} board{project._count.boardProjects !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-0">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(project.createdAt), 'MMM d, yyyy')}
                  </div>
                  <div className="flex gap-2">
                    {project._count?.boardProjects > 0 && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/${workspaceId}/boards/multi-view?project=${project.id}`}>
                          <Layout className="h-3 w-3 mr-1" />
                          Multi-Board
                        </Link>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/${workspaceId}/projects/${project.id}`}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        workspaceId={workspaceId}
      />

      {/* Edit Project Dialog */}
      {projectToEdit && (
        <EditProjectDialog
          open={!!projectToEdit}
          onOpenChange={(open) => !open && setProjectToEdit(null)}
          project={projectToEdit}
        />
      )}

      {/* Create Board Dialog */}
      {selectedProjectForBoard && (
        <CreateBoardDialog
          isOpen={showCreateBoardDialog}
          onClose={() => setShowCreateBoardDialog(false)}
          onSuccess={handleBoardCreated}
          initialProjectIds={[selectedProjectForBoard]}
        />
      )}

      {/* Share Project Dialog */}
      {selectedProjectForShare && (
        <ShareProjectDialog
          project={selectedProjectForShare}
          isOpen={showShareDialog}
          onClose={handleShareDialogClose}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This action cannot be undone.
              {projectToDelete?._count && (
                projectToDelete._count.tasks > 0 ||
                projectToDelete._count.epics > 0 ||
                projectToDelete._count.milestones > 0 ||
                projectToDelete._count.stories > 0 ||
                projectToDelete._count.boardProjects > 0
              ) && (
                <div className="mt-3 p-3 bg-destructive/10 rounded-md">
                  <p className="text-sm font-medium text-destructive mb-2">
                    This project contains:
                  </p>
                  <ul className="text-sm text-destructive space-y-1">
                    {projectToDelete._count.tasks > 0 && (
                      <li>• {projectToDelete._count.tasks} task{projectToDelete._count.tasks !== 1 ? 's' : ''}</li>
                    )}
                    {projectToDelete._count.epics > 0 && (
                      <li>• {projectToDelete._count.epics} epic{projectToDelete._count.epics !== 1 ? 's' : ''}</li>
                    )}
                    {projectToDelete._count.milestones > 0 && (
                      <li>• {projectToDelete._count.milestones} milestone{projectToDelete._count.milestones !== 1 ? 's' : ''}</li>
                    )}
                    {projectToDelete._count.stories > 0 && (
                      <li>• {projectToDelete._count.stories} stor{projectToDelete._count.stories !== 1 ? 'ies' : 'y'}</li>
                    )}
                    {projectToDelete._count.boardProjects > 0 && (
                      <li>• {projectToDelete._count.boardProjects} board connection{projectToDelete._count.boardProjects !== 1 ? 's' : ''}</li>
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
              {deleteProjectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Project'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}