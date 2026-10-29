"use client";

import { useRouter } from "next/navigation";
import { useIssue } from "@/hooks/queries/useIssues";
import { useViewTracking } from "@/hooks/useViewTracking";
import { useIssueModalUrlState } from "@/hooks/useIssueModalUrlState";
import { IssueDetailContent } from "@/components/issue/IssueDetailContent";
import { IssueDetailModal } from "@/components/issue/IssueDetailModal";

interface IssuePageClientProps {
  issueId: string;
  workspaceId: string;
  initialIssue: any;
  viewSlug: string | null;
  viewName: string | null;
}

export function IssuePageClient({ issueId, workspaceId, initialIssue, viewSlug, viewName }: IssuePageClientProps) {
  const router = useRouter();
  const { selectedIssueId, closeModal } = useIssueModalUrlState();
  // Seeded from the server render; later refreshes and mutations go through the same cache the modal uses.
  const { data, error: queryError, refetch } = useIssue(issueId, workspaceId, { issue: initialIssue });
  const issue = data?.issue ?? data ?? initialIssue;
  const error = queryError ? (queryError as Error).message : null;

  useViewTracking({ itemType: 'issue', itemId: issueId, enabled: !!issue && !error });

  return (
    <div className="h-full w-full overflow-hidden bg-collab-950">
      <title>
        {issue?.issueKey && issue?.title
          ? `[${issue.issueKey}] ${issue.title} - Collab by Weezboo`
          : 'Collab by Weezboo'}
      </title>

      <IssueDetailContent
        issue={issue}
        error={error}
        isLoading={false}
        onRefresh={() => { void refetch(); }}
        onClose={() => router.back()}
        workspaceId={workspaceId}
        issueId={issueId}
        viewSlug={viewSlug || undefined}
        viewName={viewName || undefined}
      />

      {selectedIssueId && (
        <IssueDetailModal issueId={selectedIssueId} onClose={closeModal} />
      )}
    </div>
  );
}
