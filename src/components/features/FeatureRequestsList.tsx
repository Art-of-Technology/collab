"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  FolderKanban,
  ChevronDown,
  Lightbulb,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeatureRequests } from "@/hooks/queries/useFeature";
import { useWorkspace } from "@/context/WorkspaceContext";
import { cn } from "@/lib/utils";

interface FeatureRequestsListProps {
  currentUserId: string;
  projectId?: string;
  showProjectBadge?: boolean;
}

// Status configuration
const statusConfig: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  pending: {
    label: "Pending",
    icon: <Clock className="h-3 w-3" />,
    bg: "bg-[#3f3f46]/20",
    text: "text-[#9c9ca1]",
  },
  PENDING: {
    label: "Pending",
    icon: <Clock className="h-3 w-3" />,
    bg: "bg-[#3f3f46]/20",
    text: "text-[#9c9ca1]",
  },
  accepted: {
    label: "Accepted",
    icon: <CheckCircle2 className="h-3 w-3" />,
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
  },
  PLANNED: {
    label: "Planned",
    icon: <Sparkles className="h-3 w-3" />,
    bg: "bg-purple-500/10",
    text: "text-purple-400",
  },
  rejected: {
    label: "Rejected",
    icon: <XCircle className="h-3 w-3" />,
    bg: "bg-red-500/10",
    text: "text-red-400",
  },
  DECLINED: {
    label: "Declined",
    icon: <XCircle className="h-3 w-3" />,
    bg: "bg-red-500/10",
    text: "text-red-400",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-3 w-3" />,
    bg: "bg-blue-500/10",
    text: "text-blue-400",
  },
  COMPLETED: {
    label: "Completed",
    icon: <CheckCircle2 className="h-3 w-3" />,
    bg: "bg-blue-500/10",
    text: "text-blue-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    icon: <Loader2 className="h-3 w-3" />,
    bg: "bg-amber-500/10",
    text: "text-amber-400",
  },
};

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

const orderOptions = [
  { value: "most_votes", label: "Most Votes" },
  { value: "least_votes", label: "Least Votes" },
  { value: "latest", label: "Latest" },
  { value: "oldest", label: "Oldest" },
];

export default function FeatureRequestsList({
  currentUserId,
  projectId,
  showProjectBadge = true,
}: FeatureRequestsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();

  const status = searchParams.get("status") || "all";
  const orderBy = searchParams.get("orderBy") || "most_votes";
  const page = parseInt(searchParams.get("page") || "1");

  const { data, isLoading, error } = useFeatureRequests({
    page,
    limit: 10,
    status,
    orderBy,
    projectId,
    workspaceId: currentWorkspace?.id,
  });

  const featureRequests = data?.featureRequests || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: 10,
    totalPages: 1,
    totalCount: 0,
  };

  const updateQueryParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") {
      params.set("page", "1");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    updateQueryParams("page", newPage.toString());
  };

  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load feature requests",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const getStatusConfig = (status: string) => {
    return statusConfig[status] || statusConfig.pending;
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return "";
    const plainText = text.replace(/<[^>]*>/g, "");
    if (plainText.length <= maxLength) return plainText;
    return plainText.slice(0, maxLength) + "...";
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filters Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 h-9 px-3 rounded-lg bg-[#171719] border border-[#1f1f22] text-sm text-[#9c9ca1] hover:bg-[#1f1f22] hover:border-[#3f3f46] transition-colors">
                <span>{statusOptions.find((o) => o.value === status)?.label || "All Statuses"}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#52525b]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bg-[#171719] border-[#1f1f22] min-w-[140px]"
            >
              {statusOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => updateQueryParams("status", option.value)}
                  className={cn(
                    "text-[#9c9ca1] hover:text-[#fafafa] hover:bg-[#1f1f22] cursor-pointer",
                    status === option.value && "text-[#fafafa] bg-[#1f1f22]"
                  )}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 h-9 px-3 rounded-lg bg-[#171719] border border-[#1f1f22] text-sm text-[#9c9ca1] hover:bg-[#1f1f22] hover:border-[#3f3f46] transition-colors">
                <span>{orderOptions.find((o) => o.value === orderBy)?.label || "Most Votes"}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#52525b]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="bg-[#171719] border-[#1f1f22] min-w-[140px]"
            >
              {orderOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => updateQueryParams("orderBy", option.value)}
                  className={cn(
                    "text-[#9c9ca1] hover:text-[#fafafa] hover:bg-[#1f1f22] cursor-pointer",
                    orderBy === option.value && "text-[#fafafa] bg-[#1f1f22]"
                  )}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span className="text-xs text-[#52525b]">
          {pagination.totalCount} request{pagination.totalCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#52525b]" />
        </div>
      ) : featureRequests.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl bg-[#171719] border border-[#1f1f22] py-16 text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-2xl bg-[#101011] mb-4">
              <Lightbulb className="h-8 w-8 text-[#3f3f46]" />
            </div>
            <h3 className="text-sm font-medium text-[#9c9ca1] mb-1">No feature requests found</h3>
            <p className="text-xs text-[#52525b]">Be the first to submit an idea!</p>
          </div>
        </div>
      ) : (
        /* Feature Requests List */
        <div className="rounded-2xl bg-[#171719] border border-[#1f1f22] overflow-hidden divide-y divide-[#1f1f22]">
          {featureRequests.map((request) => {
            const featureLink = currentWorkspace
              ? `${pathname.replace(/\?.*$/, "")}/${request.id}`.replace(/\/+/g, "/")
              : "#";
            const statusCfg = getStatusConfig(request.status);

            return (
              <Link
                href={featureLink}
                key={request.id}
                className="group flex items-start gap-4 p-5 hover:bg-[#1f1f22] transition-colors"
              >
                {/* Vote Score */}
                <div className="flex flex-col items-center gap-0.5 w-12 flex-shrink-0 pt-0.5">
                  <div
                    className={cn(
                      "flex items-center justify-center",
                      request.voteScore > 0
                        ? "text-emerald-400"
                        : request.voteScore < 0
                        ? "text-red-400"
                        : "text-[#52525b]"
                    )}
                  >
                    {request.voteScore >= 0 ? (
                      <ThumbsUp className="h-5 w-5" />
                    ) : (
                      <ThumbsDown className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-lg font-semibold",
                      request.voteScore > 0
                        ? "text-emerald-400"
                        : request.voteScore < 0
                        ? "text-red-400"
                        : "text-[#75757a]"
                    )}
                  >
                    {request.voteScore > 0 ? "+" : ""}
                    {request.voteScore}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Title Row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-[15px] font-medium text-[#fafafa] group-hover:text-white transition-colors line-clamp-1">
                      {request.title}
                    </h3>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md flex-shrink-0",
                        statusCfg.bg,
                        statusCfg.text
                      )}
                    >
                      {statusCfg.icon}
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-[#75757a] line-clamp-2 mb-3">
                    {truncateText(request.description, 180)}
                  </p>

                  {/* Meta Row */}
                  <div className="flex items-center gap-4 text-xs text-[#52525b]">
                    {/* Author */}
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={request.author.image || undefined} />
                        <AvatarFallback className="text-[8px] bg-[#27272b] text-[#75757a]">
                          {request.author.name?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[#75757a]">
                        {request.author.id === currentUserId ? "You" : request.author.name}
                      </span>
                    </div>

                    {/* Project Badge */}
                    {showProjectBadge && !projectId && request.project && (
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: request.project.color || "#6366f1" }}
                        />
                        <span>{request.project.name}</span>
                      </div>
                    )}

                    {/* Comments */}
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      <span>{request._count.comments}</span>
                    </div>

                    {/* Time */}
                    <span className="ml-auto">
                      {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page === 1 || isLoading}
            className="h-8 px-3 text-[#75757a] hover:text-[#fafafa] hover:bg-[#1f1f22] disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={cn(
                    "h-8 w-8 rounded-lg text-sm transition-colors",
                    pagination.page === pageNum
                      ? "bg-[#1f1f22] text-[#fafafa]"
                      : "text-[#75757a] hover:bg-[#171719] hover:text-[#9c9ca1]"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages || isLoading}
            className="h-8 px-3 text-[#75757a] hover:text-[#fafafa] hover:bg-[#1f1f22] disabled:opacity-30"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
