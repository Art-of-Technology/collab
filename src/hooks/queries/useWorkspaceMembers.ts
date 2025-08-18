import { useQuery } from '@tanstack/react-query';

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  image?: string;
}

async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const response = await fetch(`/api/workspaces/${workspaceId}/members`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch workspace members');
  }
  
  const data = await response.json();
  const membersArray: any[] = Array.isArray(data) ? data : (data.members || []);
  
  // Normalize the member data structure
  return membersArray.map((m: any) => ({
    id: m.user?.id || m.id,
    name: m.user?.name || m.name,
    email: m.user?.email || m.email,
    image: m.user?.image || m.image
  }));
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workspaceMembers', workspaceId],
    queryFn: () => fetchWorkspaceMembers(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes - members don't change frequently
    gcTime: 1000 * 60 * 10, // 10 minutes cache time
  });
}

// Query key factory for workspace members
export const workspaceMembersKeys = {
  all: ['workspaceMembers'] as const,
  byWorkspace: (workspaceId: string) => ['workspaceMembers', workspaceId] as const,
};
