import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { IssueRelationType, RelationItem } from "../types/relation";

export function useAddRelation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      issueKey,
      targetIssueId,
      relationType,
    }: {
      workspaceId: string;
      issueKey: string;
      targetIssueId: string;
      relationType: IssueRelationType;
    }) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/issues/${issueKey}/relations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetIssueId,
          relationType,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add relation");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["issue-relations", variables.workspaceId, variables.issueKey],
      });
      toast({
        title: "Success",
        description: "Relation added successfully",
      });
    },
    onError: (error) => {
      console.error("Error adding relation:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add relation",
        variant: "destructive",
      });
    },
  });
}

export function useRemoveRelation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      issueKey,
      relationId,
    }: {
      workspaceId: string;
      issueKey: string;
      relationId: string;
    }) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/issues/${issueKey}/relations/${relationId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove relation");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["issue-relations", variables.workspaceId, variables.issueKey],
      });
      toast({
        title: "Success",
        description: "Relation removed successfully",
      });
    },
    onError: (error) => {
      console.error("Error removing relation:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove relation",
        variant: "destructive",
      });
    },
  });
}

export function useAddMultipleRelations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      issueKey,
      relations,
    }: {
      workspaceId: string;
      issueKey: string;
      relations: Array<{
        targetIssueId: string;
        relationType: IssueRelationType;
      }>;
    }) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/issues/${issueKey}/relations/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ relations }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add relations");
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["issue-relations", variables.workspaceId, variables.issueKey],
      });
      toast({
        title: "Success",
        description: `Added ${variables.relations.length} relation(s) successfully`,
      });
    },
    onError: (error) => {
      console.error("Error adding relations:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add relations",
        variant: "destructive",
      });
    },
  });
}
