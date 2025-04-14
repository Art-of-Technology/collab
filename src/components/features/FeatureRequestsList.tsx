"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Filter, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFeatureRequests } from "@/hooks/queries/useFeature";
import { MarkdownContent } from "@/components/ui/markdown-content";


interface FeatureRequestsListProps {
  currentUserId: string;
}

export default function FeatureRequestsList({ currentUserId }: FeatureRequestsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Get query params
  const status = searchParams.get("status") || "all";
  const orderBy = searchParams.get("orderBy") || "most_votes";
  const page = parseInt(searchParams.get("page") || "1");

  // Status options for filter
  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "pending", label: "Pending" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
    { value: "completed", label: "Completed" },
  ];

  // Order options for sorting
  const orderOptions = [
    { value: "latest", label: "Latest" },
    { value: "oldest", label: "Oldest" },
    { value: "most_votes", label: "Most Votes" },
    { value: "least_votes", label: "Least Votes" },
  ];

  // Fetch data using TanStack Query
  const { data, isLoading, error } = useFeatureRequests({
    page,
    limit: 10,
    status,
    orderBy
  });

  const featureRequests = data?.featureRequests || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: 10,
    totalPages: 1,
    totalCount: 0
  };

  // Helper function to update URL parameters
  const updateQueryParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    // Reset to page 1 when changing filters
    if (key !== "page") {
      params.set("page", "1");
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  // Handle filter and order changes
  const handleStatusChange = (value: string) => {
    updateQueryParams("status", value);
  };

  const handleOrderChange = (value: string) => {
    updateQueryParams("orderBy", value);
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    updateQueryParams("page", newPage.toString());
  };

  // Display error message if query fails
  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: "Failed to load feature requests",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  // Get a badge variant based on status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
      case "PENDING":
        return <Badge variant="secondary" className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-600 transition-colors">Pending</Badge>;
      case "accepted":
      case "PLANNED":
        return <Badge variant="secondary" className="bg-green-500/10 hover:bg-green-500/20 text-green-600 transition-colors">Accepted</Badge>;
      case "rejected":
      case "DECLINED":
        return <Badge variant="secondary" className="bg-red-500/10 hover:bg-red-500/20 text-red-600 transition-colors">Rejected</Badge>;
      case "completed":
      case "COMPLETED":
      case "IN_PROGRESS":
        return <Badge variant="secondary" className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 transition-colors">Completed</Badge>;
      default:
        return null;
    }
  };

  // Truncate description for preview
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Filter className="h-4 w-4" />
            <span>Filter:</span>
          </div>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px] bg-background border-border/60 focus:border-primary focus:ring-primary">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 text-muted-foreground text-sm ml-2">
            <ArrowUpDown className="h-4 w-4" />
            <span>Sort:</span>
          </div>
          <Select value={orderBy} onValueChange={handleOrderChange}>
            <SelectTrigger className="w-[180px] bg-background border-border/60 focus:border-primary focus:ring-primary">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {orderOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-sm bg-secondary/50 py-1 px-3 rounded-full text-secondary-foreground">
          {pagination.totalCount} feature request{pagination.totalCount !== 1 ? "s" : ""}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : featureRequests.length === 0 ? (
        <Card className="text-center py-12 bg-card/95 backdrop-blur-sm border-border/40 shadow-lg">
          <p className="text-muted-foreground">No feature requests found</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {featureRequests.map((request) => (
            <Link href={`/features/${request.id}`} key={request.id} className="block group">
              <Card className="overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border-border/40 bg-card/95 backdrop-blur-sm">
                <div className="p-6">
                  <div className="flex justify-between">
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">{request.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>
                          {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                        </span>
                        {getStatusBadge(request.status)}
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center min-w-[70px] text-center">
                      <span className={`text-2xl font-bold transition-colors ${request.voteScore > 0
                        ? 'text-green-600'
                        : request.voteScore < 0
                          ? 'text-red-600'
                          : ''
                        }`}>
                        {request.voteScore}
                      </span>
                      <span className="text-xs text-muted-foreground">votes</span>
                    </div>
                  </div>

                  <div className="mt-4 line-clamp-2 group-hover:text-foreground/90 transition-colors">
                    <MarkdownContent 
                      content={truncateText(request.description, 200)} 
                      htmlContent={request.description}
                      className="prose-sm text-muted-foreground"
                    />
                  </div>

                  <div className="mt-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 border border-border/40">
                        <AvatarImage src={request.author.image || undefined} alt={request.author.name || "User"} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {request.author.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {request.author.id === currentUserId ? "You" : request.author.name}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {request._count.comments} comment{request._count.comments !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page === 1 || isLoading}
            className="bg-background border-border/60 hover:bg-primary/10 hover:text-primary transition-colors duration-200"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="text-sm bg-secondary/30 py-1 px-3 rounded-md">
            Page {pagination.page} of {pagination.totalPages}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages || isLoading}
            className="bg-background border-border/60 hover:bg-primary/10 hover:text-primary transition-colors duration-200"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
} 