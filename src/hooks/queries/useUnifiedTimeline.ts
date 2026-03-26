import { useInfiniteQuery } from "@tanstack/react-query";

interface TimelineUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface TimelineIssue {
  id: string;
  issueKey: string;
  title: string;
  type: string;
  status: {
    id: string;
    name: string;
    displayName: string;
    color: string | null;
  } | null;
  project: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
    issuePrefix: string;
  } | null;
}

interface TimelineStatusRef {
  id: string;
  name: string;
  displayName: string;
  color: string | null;
  iconName?: string | null;
}

export interface ActivityTimelineItem {
  id: string;
  type: "activity";
  action: string;
  fieldName: string | null;
  oldValue: any;
  newValue: any;
  details: any;
  user: TimelineUser;
  issue: TimelineIssue | null;
  // Status change FK relations — proper displayName from DB
  oldStatus: TimelineStatusRef | null;
  newStatus: TimelineStatusRef | null;
  createdAt: string;
}

export interface PostTimelineItem {
  id: string;
  type: "post";
  postType: string;
  priority: string;
  message: string;
  html: string | null;
  user: TimelineUser;
  commentCount: number;
  reactionCount: number;
  createdAt: string;
}

export type TimelineItem = ActivityTimelineItem | PostTimelineItem;

interface TimelineResponse {
  timeline: TimelineItem[];
  nextCursor: string | null;
  hasMore: boolean;
  stats: {
    todayCount: number;
    weekCount: number;
  };
}

interface UseUnifiedTimelineOptions {
  workspaceId?: string;
  mine?: boolean;
  limit?: number;
}

export function useUnifiedTimeline({
  workspaceId,
  mine = false,
  limit = 30,
}: UseUnifiedTimelineOptions) {
  return useInfiniteQuery({
    queryKey: ["unified-timeline", workspaceId, mine, limit],
    queryFn: async ({ pageParam }): Promise<TimelineResponse> => {
      const params = new URLSearchParams({
        workspaceId: workspaceId!,
        limit: limit.toString(),
        mine: mine.toString(),
      });

      if (pageParam) {
        params.set("cursor", pageParam);
      }

      const res = await fetch(`/api/timeline/unified?${params}`);
      if (!res.ok) {
        throw new Error("Failed to fetch timeline");
      }
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!workspaceId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute for live updates
  });
}
