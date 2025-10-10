"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, History, Users, Link as LinkIcon } from "lucide-react";
import { IssueActivity } from "./IssueActivity";
import { IssueRelationsSection } from "./IssueRelationsSection";
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
  // Determine which tabs to show based on issue type and settings
  // Always show the Time tab; the inner content will display an informative
  // message when time tracking is disabled for the workspace.
  const showSessions = false;
  const showHelpers = false; // Show helpers for all issues
  const showRelations = true; // Show relations for all issues

  // Calculate grid columns dynamically - Relations is now first (no comments)
  const tabCount = (showRelations ? 1 : 0) +
    (showSessions ? 1 : 0) +
    (showHelpers ? 1 : 0) +
    1; // activity (always shown)
  const gridCols = `grid-cols-${Math.min(tabCount, 6)}`;

  // Default tab based on what's available
  const defaultTab = showRelations ? "relations" :
    showSessions ? "sessions" :
      showHelpers ? "helpers" : "activity";

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

            {showSessions && (
              <TabsTrigger
                value="sessions"
                className="flex items-center gap-1.5 px-2 py-1 text-sm data-[state=active]:text-[#e1e7ef] text-[#7d8590] hover:text-[#c9d1d9] transition-colors data-[state=active]:bg-transparent border-0"
              >
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Time</span>
              </TabsTrigger>
            )}

            {showHelpers && (
              <TabsTrigger
                value="helpers"
                className="flex items-center gap-1.5 px-2 py-1 text-sm data-[state=active]:text-[#e1e7ef] text-[#7d8590] hover:text-[#c9d1d9] transition-colors data-[state=active]:bg-transparent border-0"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Team</span>
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
                onRefresh={onRefresh}
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
