import type { DashboardScope, NeedsYouKind, NeedsYouOverview } from '@/types/workspace-dashboard';

export async function loadNeedsYou(_options: {
  actorId: string;
  workspaceId: string;
  scope: DashboardScope;
  kind?: NeedsYouKind;
  now?: Date;
}): Promise<NeedsYouOverview | null> {
  return null;
}
