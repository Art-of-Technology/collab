"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, Link as LinkIcon, Code, Clock } from "lucide-react";
import { IssueActivity } from "./IssueActivity";
import { IssueRelationsSection } from "./IssueRelationsSection";
import { IssueTimeTrackingSection } from "./IssueTimeTrackingSection";
import { GitHubIssueIntegration } from "@/components/github/GitHubIssueIntegration";
import type { IssueComment } from "@/types/issue";

interface IssueTabsProps {
  issue: any;
  initialComments?: IssueComment[] | any[];
  currentUserId: string;
  workspaceId: string;
  onRefresh: () => void;
  mode?: 'modal' | 'page';
}

export function IssueTabs({
  issue,
  initialComments = [],
  currentUserId,
  workspaceId,
  onRefresh,
  mode,
}: IssueTabsProps) {
  // Determine which tabs to show based on issue type and settings
  const showRelations = true;
  const showGitHub = true;
  const showTimeTracking = true;

  // Calculate grid columns dynamically
  const tabCount = (showRelations ? 1 : 0) +
    (showTimeTracking ? 1 : 0) +
    (showGitHub ? 1 : 0) +
    1; // activity (always shown)
  const gridCols = `grid-cols-${Math.min(tabCount, 6)}`;

  // Default tab based on what's available
  const defaultTab = showRelations ? "relations" :
    showTimeTracking ? "time" :
    showGitHub ? "github" : "activity";

  return (
    <div className="mt-6">
      {/* Tabs for all sections */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <div className="border-b border-[#21262d] pb-1">
          <TabsList className={`grid w-full ${gridCols} lg:w-auto lg:inline-flex bg-transparent`}>
            {showRelations && (
              <TabsTrigger
                value="relations"
                className="flex items-center gap-1.5 px-2 py-1 text-sm data-[state=active]:text-[#e1e7ef] text-[#7d8590] hover:text-[#c9d1d9] transition-colors data-[state=active]:bg-transparent border-0"
              >
                <LinkIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Relations</span>
              </TabsTrigger>
            )}

            {showTimeTracking && (
              <TabsTrigger
                value="time"
                className="flex items-center gap-1.5 px-2 py-1 text-sm data-[state=active]:text-[#e1e7ef] text-[#7d8590] hover:text-[#c9d1d9] transition-colors data-[state=active]:bg-transparent border-0"
              >
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Work Log</span>
              </TabsTrigger>
            )}

            {showGitHub && (
              <TabsTrigger
                value="github"
                className="flex items-center gap-1.5 px-2 py-1 text-sm data-[state=active]:text-[#e1e7ef] text-[#7d8590] hover:text-[#c9d1d9] transition-colors data-[state=active]:bg-transparent border-0"
              >
                <Code className="h-4 w-4" />
                <span className="hidden sm:inline">GitHub</span>
              </TabsTrigger>
            )}

            <TabsTrigger
              value="activity"
              className="flex items-center gap-1.5 px-2 py-1 text-sm data-[state=active]:text-[#e1e7ef] text-[#7d8590] hover:text-[#c9d1d9] transition-colors data-[state=active]:bg-transparent border-0"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="pt-4">
          {showRelations && (
            <TabsContent value="relations" className="mt-0">
              <IssueRelationsSection
                issue={issue}
                workspaceId={workspaceId}
                mode={mode}
              />
            </TabsContent>
          )}

          {showTimeTracking && (
            <TabsContent value="time" className="mt-0">
              <IssueTimeTrackingSection
                issue={issue}
                workspaceId={workspaceId}
                onRefresh={onRefresh}
              />
            </TabsContent>
          )}

          {showGitHub && (
            <TabsContent value="github" className="mt-0">
              <GitHubIssueIntegration
                issueId={issue.id}
                issueKey={issue.issueKey}
                projectId={issue.projectId}
                projectSlug={issue.project?.slug}
              />
            </TabsContent>
          )}

          <TabsContent value="activity" className="mt-0">
            <IssueActivity issueId={issue.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
