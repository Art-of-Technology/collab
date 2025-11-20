import { Skeleton } from "@/components/ui/skeleton";
import { RelationsSkeleton } from "./sections/relations/components/RelationsSkeleton";
import { CommentsSkeleton } from "./sections/comments/components/CommentsSkeleton";

export function IssueDetailSkeleton() {
  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Page Header Skeleton */}
      <div className="h-14 border-b border-[#1f1f1f] bg-[#0a0a0a] flex items-center justify-between px-4 flex-none sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded bg-[#1f1f1f]" />
          <Skeleton className="h-4 w-32 bg-[#1f1f1f]" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-20 bg-[#1f1f1f]" />
          <Skeleton className="h-7 w-20 bg-[#1f1f1f]" />
          <Skeleton className="h-7 w-7 bg-[#1f1f1f] rounded-md" />
          <Skeleton className="h-7 w-7 bg-[#1f1f1f] rounded-md" />
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto p-6 w-full flex flex-col min-h-0">
        {/* Header Section */}
        <div className="flex-none space-y-4 mb-6">
          {/* Title Row */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Skeleton className="h-6 w-20 bg-[#1f1f1f] rounded" /> {/* Issue Key */}
            <Skeleton className="h-8 flex-1 bg-[#1f1f1f] rounded" /> {/* Title */}
          </div>

          {/* Properties Row */}
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-7 w-28 bg-[#1f1f1f] rounded" /> {/* Status */}
            <Skeleton className="h-7 w-24 bg-[#1f1f1f] rounded" /> {/* Priority */}
            <Skeleton className="h-7 w-24 bg-[#1f1f1f] rounded" /> {/* Type */}
            <Skeleton className="h-7 w-32 bg-[#1f1f1f] rounded" /> {/* Assignee */}
            <Skeleton className="h-7 w-32 bg-[#1f1f1f] rounded hidden md:block" /> {/* Reporter */}
            <Skeleton className="h-7 w-20 bg-[#1f1f1f] rounded hidden sm:block" /> {/* Project */}
            <Skeleton className="h-7 w-24 bg-[#1f1f1f] rounded hidden sm:block" /> {/* Due Date */}
          </div>

          {/* Meta Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-48 bg-[#1f1f1f] rounded" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-24 bg-[#1f1f1f] rounded" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-8 pb-8">
            {/* Description Editor Skeleton */}
            <div className="space-y-2">
              <div className="w-full space-y-2 border border-[#1f1f1f] rounded-md p-4 min-h-[400px] bg-[#0d0d0d]">
                <Skeleton className="h-4 w-3/4 bg-[#1f1f1f]" />
                <Skeleton className="h-4 w-full bg-[#1f1f1f]" />
                <Skeleton className="h-4 w-5/6 bg-[#1f1f1f]" />
                <Skeleton className="h-4 w-full bg-[#1f1f1f]" />
                <Skeleton className="h-4 w-2/3 bg-[#1f1f1f]" />
              </div>
            </div>

            {/* Tabs Skeleton */}
            <div className="space-y-4">
              <div className="flex gap-4 border-b border-[#1f1f1f]">
                <Skeleton className="h-8 w-20 bg-[#1f1f1f]" /> {/* Relations */}
                <Skeleton className="h-8 w-20 bg-[#1f1f1f]" /> {/* GitHub */}
                <Skeleton className="h-8 w-16 bg-[#1f1f1f]" /> {/* Time */}
                <Skeleton className="h-8 w-16 bg-[#1f1f1f]" /> {/* Team */}
                <Skeleton className="h-8 w-20 bg-[#1f1f1f]" /> {/* Activity */}
              </div>

              {/* Default Tab Content Skeleton (Relations) */}
              <RelationsSkeleton />
            </div>

            {/* Comments Skeleton */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#21262d] pb-2">
                <Skeleton className="h-4 w-4 bg-[#1f1f1f]" />
                <Skeleton className="h-4 w-20 bg-[#1f1f1f]" />
              </div>
              <CommentsSkeleton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

