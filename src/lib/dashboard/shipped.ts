import type { ShippedOverview } from '@/types/workspace-dashboard';

export async function loadShipped(_options: {
  actorId: string;
  workspaceId: string;
  now?: Date;
}): Promise<ShippedOverview | null> {
  return null;
}
