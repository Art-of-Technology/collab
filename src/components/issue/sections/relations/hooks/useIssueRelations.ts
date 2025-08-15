import { useQuery } from "@tanstack/react-query";
import type { IssueRelations } from "../types/relation";

export function useIssueRelations(workspaceId: string, issueKey: string) {
  return useQuery({
    queryKey: ["issue-relations", workspaceId, issueKey],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/issues/${issueKey}/relations`);
      if (!response.ok) {
        throw new Error("Failed to fetch issue relations");
      }
      const data = await response.json();
      return data as IssueRelations;
    },
    enabled: !!workspaceId && !!issueKey,
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}
