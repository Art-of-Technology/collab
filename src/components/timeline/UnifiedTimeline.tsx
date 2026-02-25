"use client";

import { useMemo, useCallback, Fragment } from "react";
import { useInView } from "react-intersection-observer";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { Loader2, Activity, Zap } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  useUnifiedTimeline,
  TimelineItem,
} from "@/hooks/queries/useUnifiedTimeline";
import ActivityItem from "./ActivityItem";
import PostItem from "./PostItem";

interface UnifiedTimelineProps {
  workspaceSlug: string;
  searchQuery?: string;
  showMineOnly?: boolean;
}

export default function UnifiedTimeline({
  workspaceSlug,
  searchQuery = "",
  showMineOnly = false,
}: UnifiedTimelineProps) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useUnifiedTimeline({ workspaceId, mine: showMineOnly });

  const { ref: loadMoreRef } = useInView({
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  });

  // Flatten all pages into a single array
  const allItems = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.timeline);
  }, [data?.pages]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;

    const query = searchQuery.toLowerCase();
    return allItems.filter((item) => {
      if (item.type === "activity") {
        return (
          item.user.name?.toLowerCase().includes(query) ||
          item.issue?.title?.toLowerCase().includes(query) ||
          item.issue?.issueKey?.toLowerCase().includes(query) ||
          item.action.toLowerCase().includes(query)
        );
      } else {
        return (
          item.user.name?.toLowerCase().includes(query) ||
          item.message?.toLowerCase().includes(query)
        );
      }
    });
  }, [allItems, searchQuery]);

  // Get stats from first page
  const stats = data?.pages[0]?.stats;

  // Group items by date
  const groupedItems = useMemo(() => {
    const groups: { label: string; date: string; items: TimelineItem[] }[] = [];
    let currentGroup: (typeof groups)[0] | null = null;

    for (const item of filteredItems) {
      const itemDate = new Date(item.createdAt);
      const dateKey = format(itemDate, "yyyy-MM-dd");

      let label: string;
      if (isToday(itemDate)) {
        label = "Today";
      } else if (isYesterday(itemDate)) {
        label = "Yesterday";
      } else if (isThisWeek(itemDate)) {
        label = format(itemDate, "EEEE");
      } else {
        label = format(itemDate, "MMM d, yyyy");
      }

      if (!currentGroup || currentGroup.date !== dateKey) {
        currentGroup = { label, date: dateKey, items: [] };
        groups.push(currentGroup);
      }

      currentGroup.items.push(item);
    }

    return groups;
  }, [filteredItems]);

  const renderItem = useCallback(
    (item: TimelineItem) => {
      if (item.type === "activity") {
        return (
          <ActivityItem
            key={item.id}
            item={item}
            workspaceSlug={workspaceSlug}
          />
        );
      }
      return (
        <PostItem key={item.id} item={item} workspaceSlug={workspaceSlug} />
      );
    },
    [workspaceSlug]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-collab-700 border-t-[#75757a] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Stats Bar */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-collab-800 border border-collab-700">
          <div className="p-2 rounded-xl bg-emerald-500/10">
            <Zap className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <span className="text-xl font-semibold text-collab-50">
              {stats?.todayCount || 0}
            </span>
            <span className="text-sm text-collab-500 ml-2">today</span>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-collab-800 border border-collab-700">
          <div className="p-2 rounded-xl bg-blue-500/10">
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <span className="text-xl font-semibold text-collab-50">
              {stats?.weekCount || 0}
            </span>
            <span className="text-sm text-collab-500 ml-2">this week</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {groupedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-collab-700 bg-collab-800/50">
          <Activity className="h-12 w-12 text-[#27272b] mb-4" />
          <h3 className="text-sm font-medium text-collab-400 mb-1">
            No activity found
          </h3>
          <p className="text-sm text-collab-500 text-center max-w-sm">
            {searchQuery
              ? "Try adjusting your search"
              : "Activity will appear here as your team works on issues"}
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[15px] top-6 bottom-0 w-px bg-gradient-to-b from-collab-700 via-[#1f1f22] to-transparent" />

          {groupedItems.map((group) => (
            <Fragment key={group.date}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-4 mt-10 first:mt-0 relative">
                <div className="w-8 h-8 rounded-full bg-collab-800 border border-collab-700 flex items-center justify-center z-10">
                  <span className="text-[10px] font-semibold text-collab-400">
                    {format(new Date(group.date), "dd")}
                  </span>
                </div>
                <span className="text-xs font-medium text-collab-500 uppercase tracking-wider">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-collab-700" />
              </div>

              {/* Items */}
              <div className="space-y-2 ml-4 pl-6">
                {group.items.map(renderItem)}
              </div>
            </Fragment>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasNextPage && (
        <div ref={loadMoreRef} className="flex justify-center py-10 ml-10">
          {isFetchingNextPage ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-collab-500" />
              <span className="text-sm text-collab-500">Loading more...</span>
            </div>
          ) : (
            <span className="text-sm text-collab-500">Scroll to load more</span>
          )}
        </div>
      )}
    </div>
  );
}
