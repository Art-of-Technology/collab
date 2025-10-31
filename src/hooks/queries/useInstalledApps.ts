import { useQuery } from '@tanstack/react-query';
import { getWorkspaceInstallations } from '@/actions/appInstallation';
import { JsonValue } from '@prisma/client/runtime/library';

interface InstalledApp {
  id: string;
  status: string;
  createdAt: Date;
  app: {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string | null;
    publisherId: string;
    permissions?: { org: boolean; user: boolean } | JsonValue | null;
  };
}

export function useInstalledApps(workspaceId?: string) {
  return useQuery({
    queryKey: ['installed-apps', workspaceId],
    queryFn: async (): Promise<InstalledApp[]> => {
      if (!workspaceId) return [];
      
      try {
        const installations = await getWorkspaceInstallations(workspaceId);
        return installations.filter(installation => installation.status === 'ACTIVE');
      } catch (error) {
        console.error('Failed to fetch installed apps:', error);
        return [];
      }
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
