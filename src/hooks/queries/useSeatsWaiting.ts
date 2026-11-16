import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

/** How many issues wait for a seat, for the left menu. Read from the browser, so no page load waits for it. */
export const useSeatsWaiting = (workspaceId?: string) => useQuery({
  queryKey: ['agent-seats-waiting', workspaceId],
  queryFn: async () => (await axios.get(`/api/workspaces/${workspaceId}/agent-seats/waiting`)).data.waiting as number,
  enabled: !!workspaceId,
  refetchInterval: 60_000,
});
