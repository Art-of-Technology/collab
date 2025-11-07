"use client";

import PostList from "@/components/posts/PostList";
import CreatePostForm from "@/components/posts/CreatePostForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XCircleIcon, Clock } from "lucide-react";
import Link from "next/link";
import { usePosts, useInfinitePosts, usePostStats } from "@/hooks/queries/usePost";
import { useSearchParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { useMemo } from "react";

interface TimelineClientProps {
  initialPosts: any[];
  currentUserId: string;
}

export default function TimelineClient({ initialPosts, currentUserId }: TimelineClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();

  const filter = searchParams.get("filter");
  const tag = searchParams.get("tag");

  // Use the current active filter in URL
  const filterType = filter === 'updates' ? 'UPDATE' :
    filter === 'blockers' ? 'BLOCKER' :
      filter === 'ideas' ? 'IDEA' :
        filter === 'questions' ? 'QUESTION' : undefined;

  // TanStack Query for infinite posts with filters
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError
  } = useInfinitePosts({
    type: filterType,
    tag: tag || undefined,
    workspaceId: currentWorkspace?.id,
    limit: 10
  });

  // Get post statistics efficiently
  const { data: postStats } = usePostStats(currentWorkspace?.id);

  // Get all posts for detailed calculations (with higher limit)
  const { data: allPosts } = usePosts({
    workspaceId: currentWorkspace?.id,
    limit: 1000 // High limit for detailed calculations
  });

  // Flatten infinite pages data or fallback to initial posts
  const displayPosts = infiniteData
    ? infiniteData.pages.flatMap((page: any) => {
      // Handle both old and new response formats
      if (Array.isArray(page)) {
        return page; // Old format: direct array
      }
      return page.posts || []; // New format: object with posts property
    })
    : initialPosts;

  // Calculate counts for each filter type (use stats for accurate totals)
  const postCounts = useMemo(() => {
    if (postStats) {
      return {
        all: postStats.total,
        updates: postStats.updates,
        blockers: postStats.blockers,
        ideas: postStats.ideas,
        questions: postStats.questions,
      };
    }

    // Fallback to calculated counts from loaded posts
    const allPostsList = allPosts || initialPosts;
    return {
      all: allPostsList.length,
      updates: allPostsList.filter((p: any) => p.type === 'UPDATE').length,
      blockers: allPostsList.filter((p: any) => p.type === 'BLOCKER').length,
      ideas: allPostsList.filter((p: any) => p.type === 'IDEA').length,
      questions: allPostsList.filter((p: any) => p.type === 'QUESTION').length,
    };
  }, [postStats, allPosts, initialPosts]);

  // Calculate activity statistics
  const activityStats = useMemo(() => {
    const allPostsList = allPosts || initialPosts;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todaysPosts = allPostsList.filter((p: any) => {
      const postDate = new Date(p.createdAt);
      return postDate >= today;
    });

    const thisWeeksPosts = allPostsList.filter((p: any) => {
      const postDate = new Date(p.createdAt);
      return postDate >= weekAgo;
    });

    const activeAuthorsToday = new Set(
      todaysPosts.map((p: any) => p.authorId)
    ).size;

    const activeAuthorsThisWeek = new Set(
      thisWeeksPosts.map((p: any) => p.authorId)
    ).size;

    const priorityPosts = allPostsList.filter((p: any) =>
      p.priority === 'high' || p.priority === 'critical'
    ).length;

    return {
      total: postStats?.total || allPostsList.length,
      today: todaysPosts.length,
      thisWeek: thisWeeksPosts.length,
      activeAuthorsToday,
      activeAuthorsThisWeek,
      priorityPosts: postStats?.priority || priorityPosts,
      blockers: postStats?.blockers || allPostsList.filter((p: any) => p.type === 'BLOCKER').length
    };
  }, [postStats, allPosts, initialPosts]);

  const handleFilterChange = (newFilter: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newFilter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', newFilter);
    }

    const newPath = `${window.location.pathname}?${params.toString()}`;
    router.push(newPath);
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {/* Page Header */}
      <PageHeader
        icon={Clock}
        title="Posts"
        subtitle="Latest updates from your team"
        leftContent={
          tag && (
            <div className="flex items-center">
              <span className="text-sm text-[#8b949e] mr-2">Filtered by:</span>
              <div className="flex items-center">
                <Badge
                  variant="secondary"
                  className="bg-[#1a1a1a] text-[#e6edf3] border-[#333] px-2 py-1 text-xs"
                >
                  #{tag}
                </Badge>
                <Link
                  href={currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timeline` : '#'}
                  className="ml-2 text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                  aria-label="Clear tag filter"
                >
                  <XCircleIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )
        }
      />

      {/* Filter Buttons */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFilterChange('all')}
            className={`h-6 px-2 text-xs border ${!filter || filter === 'all'
              ? 'border-[#58a6ff] text-[#58a6ff] bg-[#0d1421] hover:bg-[#0d1421] hover:border-[#58a6ff]'
              : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
              }`}
          >
            All
            <span className="ml-1 text-xs opacity-70">{postCounts.all}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFilterChange('updates')}
            className={`h-6 px-2 text-xs border ${filter === 'updates'
              ? 'border-[#58a6ff] text-[#58a6ff] bg-[#0d1421] hover:bg-[#0d1421] hover:border-[#58a6ff]'
              : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
              }`}
          >
            Updates
            <span className="ml-1 text-xs opacity-70">{postCounts.updates}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFilterChange('blockers')}
            className={`h-6 px-2 text-xs border ${filter === 'blockers'
              ? 'border-[#f85149] text-[#f85149] bg-[#21110f] hover:bg-[#21110f] hover:border-[#f85149]'
              : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
              }`}
          >
            Blockers
            <span className="ml-1 text-xs opacity-70">{postCounts.blockers}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFilterChange('ideas')}
            className={`h-6 px-2 text-xs border ${filter === 'ideas'
              ? 'border-[#a5a5a5] text-[#a5a5a5] bg-[#1a1a1a] hover:bg-[#1a1a1a] hover:border-[#a5a5a5]'
              : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
              }`}
          >
            Ideas
            <span className="ml-1 text-xs opacity-70">{postCounts.ideas}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleFilterChange('questions')}
            className={`h-6 px-2 text-xs border ${filter === 'questions'
              ? 'border-[#a5a5a5] text-[#a5a5a5] bg-[#1a1a1a] hover:bg-[#1a1a1a] hover:border-[#a5a5a5]'
              : 'border-[#21262d] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#30363d] bg-[#0d1117] hover:bg-[#161b22]'
              }`}
          >
            Questions
            <span className="ml-1 text-xs opacity-70">{postCounts.questions}</span>
          </Button>
        </div>
      </div>

      {/* Content - Fixed scroll container */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex gap-6 px-6 py-4">
          {/* Main Content */}
          <div className="flex-1 max-w-4xl min-w-0">
            <div className="mb-4">
              <CreatePostForm />
            </div>

            <div className="pb-8">
              {isLoading && initialPosts.length === 0 ? (
                <div className="flex items-center gap-2 text-[#8b949e] py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading posts...</span>
                </div>
              ) : isError ? (
                <div className="text-[#ef4444] text-sm py-8">
                  Something went wrong loading posts.
                </div>
              ) : (
                <PostList
                  posts={displayPosts}
                  currentUserId={currentUserId}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  onLoadMore={fetchNextPage}
                />
              )}
            </div>
          </div>

          {/* Right Sidebar - Enhanced Activity */}
          <div className="hidden xl:block w-64 flex-shrink-0">
            <div className="sticky top-4 space-y-4">
              {/* Activity Overview */}
              <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-4">
                <h3 className="text-sm font-medium text-[#e6edf3] mb-3 flex items-center gap-2">
                  📊 Activity Overview
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8b949e]">Total Posts</span>
                    <span className="text-[#e6edf3] font-medium">{activityStats.total}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8b949e]">Today</span>
                    <span className="text-[#22c55e] font-medium">{activityStats.today}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8b949e]">This Week</span>
                    <span className="text-[#58a6ff] font-medium">{activityStats.thisWeek}</span>
                  </div>
                  {activityStats.blockers > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#8b949e]">🚫 Blockers</span>
                      <span className="text-[#f85149] font-medium">{activityStats.blockers}</span>
                    </div>
                  )}
                  {activityStats.priorityPosts > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#8b949e]">⚡ Priority</span>
                      <span className="text-[#fbbf24] font-medium">{activityStats.priorityPosts}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Team Activity */}
              <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-4">
                <h3 className="text-sm font-medium text-[#e6edf3] mb-3 flex items-center gap-2">
                  👥 Team Activity
                </h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8b949e]">Active Today</span>
                    <span className="text-[#22c55e] font-medium">
                      {activityStats.activeAuthorsToday} {activityStats.activeAuthorsToday === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8b949e]">Active This Week</span>
                    <span className="text-[#58a6ff] font-medium">
                      {activityStats.activeAuthorsThisWeek} {activityStats.activeAuthorsThisWeek === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#8b949e]">Avg. per Person</span>
                    <span className="text-[#e6edf3] font-medium">
                      {activityStats.activeAuthorsThisWeek > 0
                        ? Math.round(activityStats.thisWeek / activityStats.activeAuthorsThisWeek)
                        : 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-4">
                <h3 className="text-sm font-medium text-[#e6edf3] mb-3 flex items-center gap-2">
                  ⚡ Quick Stats
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#1a1a1a] rounded p-2 text-center">
                    <div className="text-[#58a6ff] font-bold">{postCounts.updates}</div>
                    <div className="text-[#8b949e]">Updates</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded p-2 text-center">
                    <div className="text-[#a5a5a5] font-bold">{postCounts.ideas}</div>
                    <div className="text-[#8b949e]">Ideas</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded p-2 text-center">
                    <div className="text-[#a5a5a5] font-bold">{postCounts.questions}</div>
                    <div className="text-[#8b949e]">Questions</div>
                  </div>
                  <div className="bg-[#1a1a1a] rounded p-2 text-center">
                    <div className="text-[#22c55e] font-bold">
                      {activityStats.total > 0 ? Math.round((activityStats.today / activityStats.total) * 100) : 0}%
                    </div>
                    <div className="text-[#8b949e]">Today</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}