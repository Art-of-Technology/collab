import { useQuery } from "@tanstack/react-query";
import type { IssueComment } from "../types/comment";

export function useIssueComments(issueId: string) {
  return useQuery({
    queryKey: ["issue-comments", issueId],
    queryFn: async () => {
      const response = await fetch(`/api/issues/${issueId}/comments`);
      if (!response.ok) {
        throw new Error("Failed to fetch comments");
      }
      return response.json() as Promise<IssueComment[]>;
    },
    enabled: !!issueId,
  });
}
