import type { AgentsNowOverview } from '@/types/workspace-dashboard';

export async function loadAgentsNow(_options: {
  actorId: string;
  workspaceId: string;
}): Promise<AgentsNowOverview | null> {
  return null;
}
