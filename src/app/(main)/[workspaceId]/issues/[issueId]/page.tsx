"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { IssueDetailContent } from "@/components/issue/IssueDetailContent";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useViewTracking } from "@/hooks/useViewTracking";
import { Loader2 } from "lucide-react";
import { IssueUser } from "@/types/issue";

export default function IssuePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const issueParam = params?.issueId as string;
  
  // Extract view context from URL params or referrer
  const viewSlug = searchParams.get('view');
  const viewName = searchParams.get('viewName');

  // Use the resolved workspace ID from context
  const workspaceId = currentWorkspace?.id || null;

  if (workspaceLoading || !workspaceId || !issueParam) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8b949e]" />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-[#0a0a0a]">
      <Suspense
        fallback={
          <div className="flex h-[80vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#8b949e]" />
          </div>
        }
      >
        <IssuePageContent 
          issueId={issueParam}
          workspaceId={workspaceId}
          viewSlug={viewSlug}
          viewName={viewName}
          onClose={() => router.back()}
        />
      </Suspense>
    </div>
  );
}

function IssuePageContent({ issueId, workspaceId, viewSlug, viewName, onClose }: {
  issueId: string;
  workspaceId: string;
  viewSlug: string | null;
  viewName: string | null;
  onClose: () => void;
}) {
  const [issue, setIssue] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [createdByUser, setCreatedByUser] = useState<IssueUser | null>(null);

  // Fetch creator separately to avoid conflicts with other useIssueActivities calls
  useEffect(() => {
    let isMounted = true;

    const fetchCreator = async () => {
      try {
        // Get all activities and find the oldest one (first created)
        const response = await fetch(
          `/api/board-items/issue/${issueId}/activities`
        );
        if (response.ok && isMounted) {
          const data = await response.json();
          if (data && data.length > 0 && isMounted) {
            // Sort by oldest first and get the first activity (original creator)
            const sortedActivities = data.sort((a: any, b: any) => 
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
            setCreatedByUser(sortedActivities[0].user as IssueUser);
          }
        }
      } catch (error) {
        console.error('Error fetching creator:', error);
      }
    };

    if (issueId) {
      fetchCreator();
    }

    return () => {
      isMounted = false;
    };
  }, [issueId]);

  // Track view when issue is successfully loaded
  useViewTracking({
    itemType: 'issue',
    itemId: issueId,
    enabled: !isLoading && !error && !!issue,
  });

  const fetchIssue = useCallback(async () => {
    if (!issueId) return;

    setIsLoading(true);
    setError(null);

    try {
      const url = new URL(`/api/issues/${issueId}`, window.location.origin);
      if (workspaceId) {
        url.searchParams.set('workspaceId', workspaceId);
      }
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Issue not found");
        } else if (response.status === 403) {
          throw new Error("You don't have permission to view this issue");
        } else {
          throw new Error(`Failed to load issue (${response.status})`);
        }
      }

      const data = await response.json();
      setIssue(data.issue || data);
    } catch (err) {
      console.error("Failed to fetch issue:", err);
      setError(err instanceof Error ? err.message : "Failed to load issue. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [issueId, workspaceId]);

  useEffect(() => {
    fetchIssue();
  }, [fetchIssue]);

  return (
    <IssueDetailContent
      issue={issue}
      error={error}
      isLoading={isLoading}
      onRefresh={fetchIssue}
      onClose={onClose}
      workspaceId={workspaceId}
      issueId={issueId}
      viewSlug={viewSlug || undefined}
      viewName={viewName || undefined}
      createdByUser={createdByUser || undefined}
    />
  );
}