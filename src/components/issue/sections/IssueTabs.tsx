"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Clock, History, Users, Link as LinkIcon, GitBranch } from "lucide-react";
import { IssueHelpersSection } from "./IssueHelpersSection";
import { IssueWorkSessions } from "./IssueWorkSessions";
import { IssueActivity } from "./IssueActivity";
import { IssueRelationsSection } from "./IssueRelationsSection";
import { IssueSubIssuesSection } from "./IssueSubIssuesSection";
import { IssueCommentsSection } from "./IssueCommentsSection";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import type { IssueComment } from "@/types/issue";

interface IssueTabsProps {
  issue: any;
  initialComments?: IssueComment[] | any[];
  currentUserId: string;
  workspaceId: string;
  onRefresh: () => void;
}

export function IssueTabs({
  issue,
  initialComments = [],
  currentUserId,
  workspaceId,
  onRefresh,
}: IssueTabsProps) {
  const { settings } = useWorkspaceSettings();

  // Determine which tabs to show based on issue type and settings
  const showSessions = settings?.timeTrackingEnabled;
  const showHelpers = true; // Show helpers for all issues
  const showRelations = true; // Show relations for all issues
  const showSubIssues = issue?.children && issue.children.length > 0;

  // Calculate grid columns dynamically - Comments is always first
  const tabCount = 1 + // comments (always shown)
    (showRelations ? 1 : 0) + 
    (showSubIssues ? 1 : 0) + 
    (showSessions ? 1 : 0) + 
    (showHelpers ? 1 : 0) + 
    1; // activity (always shown)
  const gridCols = `grid-cols-${Math.min(tabCount, 6)}`;

  const defaultTab = "comments"; // Comments is always the default tab

  return (
    <div className="mt-6">
      {/* Tabs for all sections */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={`grid w-full ${gridCols} lg:w-auto lg:inline-flex bg-[#0d0d0d] border border-[#1f1f1f] rounded-t-lg`}>
          {/* Comments Tab - Always first */}
          <TabsTrigger 
            value="comments" 
            className="flex items-center gap-2 px-4 py-1 font-medium data-[state=active]:bg-[#0a0a0a] data-[state=active]:text-[#e1e7ef] data-[state=active]:border-b data-[state=active]:border-[#1f1f1f] rounded-tl-lg first:rounded-tl-lg data-[state=active]:rounded-t-none"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Comments</span>
            {initialComments.length > 0 && (
              <span className="ml-1 text-xs bg-[#333] text-[#ccc] px-1.5 py-0.5 rounded-full">
                {initialComments.length}
              </span>
            )}
          </TabsTrigger>

          {showRelations && (
            <TabsTrigger 
              value="relations" 
              className="flex items-center gap-2 px-4 py-1 font-medium data-[state=active]:bg-[#0a0a0a] data-[state=active]:text-[#e1e7ef] data-[state=active]:border-b data-[state=active]:border-[#1f1f1f]"
            >
              <LinkIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Relations</span>
            </TabsTrigger>
          )}

          {showSubIssues && (
            <TabsTrigger 
              value="subissues" 
              className="flex items-center gap-2 px-4 py-1 font-medium data-[state=active]:bg-[#0a0a0a] data-[state=active]:text-[#e1e7ef] data-[state=active]:border-b data-[state=active]:border-[#1f1f1f]"
            >
              <GitBranch className="h-4 w-4" />
              <span className="hidden sm:inline">Sub-issues</span>
              <span className="ml-1 text-xs bg-[#333] text-[#ccc] px-1.5 py-0.5 rounded-full">
                {issue.children.length}
              </span>
            </TabsTrigger>
          )}

          {showSessions && (
            <TabsTrigger 
              value="sessions" 
              className="flex items-center gap-2 px-4 py-1 font-medium data-[state=active]:bg-[#0a0a0a] data-[state=active]:text-[#e1e7ef] data-[state=active]:border-b data-[state=active]:border-[#1f1f1f]"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Time</span>
            </TabsTrigger>
          )}

          {showHelpers && (
            <TabsTrigger 
              value="helpers" 
              className="flex items-center gap-2 px-4 py-1 font-medium data-[state=active]:bg-[#0a0a0a] data-[state=active]:text-[#e1e7ef] data-[state=active]:border-b data-[state=active]:border-[#1f1f1f]"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
          )}

          <TabsTrigger 
            value="activity" 
            className="flex items-center gap-2 px-4 py-1 font-medium data-[state=active]:bg-[#0a0a0a] data-[state=active]:text-[#e1e7ef] data-[state=active]:border-b data-[state=active]:border-[#1f1f1f] rounded-tr-lg last:rounded-tr-lg data-[state=active]:rounded-t-none"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
        </TabsList>

        <div className="border border-[#1f1f1f] border-t-0 rounded-b-lg bg-[#0a0a0a]">
          {/* Comments Tab Content - Always first */}
          <TabsContent value="comments" className="mt-0 p-4">
            <IssueCommentsSection
              issueId={issue.id}
              initialComments={initialComments as any}
              currentUserId={currentUserId}
            />
          </TabsContent>

          {showRelations && (
            <TabsContent value="relations" className="mt-0 p-4">
              <IssueRelationsSection
                issue={issue}
                workspaceId={workspaceId}
                onRefresh={onRefresh}
              />
            </TabsContent>
          )}

          {showSubIssues && (
            <TabsContent value="subissues" className="mt-0 p-4">
              <IssueSubIssuesSection
                issue={issue}
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                onRefresh={onRefresh}
              />
            </TabsContent>
          )}

          {showSessions && (
            <TabsContent value="sessions" className="mt-0 p-4">
              <IssueWorkSessions 
                issueId={issue.id} 
                onRefresh={onRefresh} 
              />
            </TabsContent>
          )}

          {showHelpers && (
            <TabsContent value="helpers" className="mt-0 p-4">
              <IssueHelpersSection
                issueId={issue.id}
                assigneeId={issue.assigneeId}
                reporterId={issue.reporterId}
                currentUserId={currentUserId}
                onRefresh={onRefresh}
              />
            </TabsContent>
          )}

          <TabsContent value="activity" className="mt-0 p-4">
            <IssueActivity issueId={issue.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
