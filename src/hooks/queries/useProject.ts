import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  getProjects, 
  getProject, 
  createProject, 
  updateProject, 
  deleteProject,
  CreateProjectData,
  UpdateProjectData 
} from "@/actions/project";
import { toast } from "@/hooks/use-toast";

export const projectQueryKeys = {
  all: ['projects'] as const,
  lists: () => [...projectQueryKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...projectQueryKeys.lists(), workspaceId] as const,
  details: () => [...projectQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...projectQueryKeys.details(), id] as const,
};

export const useProjects = (workspaceId: string) => {
  return useQuery({
    queryKey: projectQueryKeys.list(workspaceId),
    queryFn: () => getProjects(workspaceId),
    enabled: !!workspaceId,
  });
};

export const useProject = (projectId: string) => {
  return useQuery({
    queryKey: projectQueryKeys.detail(projectId),
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() });
      toast({
        title: "Success",
        description: "Project created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: UpdateProjectData }) => 
      updateProject(projectId, data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.detail(project.id) });
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() });
      toast({
        title: "Success",
        description: "Project updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project",
        variant: "destructive",
      });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() });
      toast({
        title: "Success", 
        description: "Project deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete project",
        variant: "destructive",
      });
    },
  });
};