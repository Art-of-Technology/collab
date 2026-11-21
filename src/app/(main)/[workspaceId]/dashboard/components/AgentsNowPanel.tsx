import type { AgentsNowOverview, NeedsYouOverview } from '@/types/workspace-dashboard';

export default function AgentsNowPanel(_props: {
  data: AgentsNowOverview;
  waitingSeats: Extract<NeedsYouOverview, { kind: 'ready' }>['waitingSeats'] | null;
  workspaceSlug: string;
}) {
  return null;
}
