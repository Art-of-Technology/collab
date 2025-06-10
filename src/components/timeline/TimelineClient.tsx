"use client";

import PostList from "@/components/posts/PostList";
import CreatePostForm from "@/components/posts/CreatePostForm";
import FilterTabs from "@/components/posts/FilterTabs";
import { Badge } from "@/components/ui/badge";
import { XCircleIcon } from "lucide-react";
import Link from "next/link";
import { usePosts } from "@/hooks/queries/usePost";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Loader2 } from "lucide-react";

interface TimelineClientProps {
  initialPosts: any[];
  currentUserId: string;
}

export default function TimelineClient({ initialPosts, currentUserId }: TimelineClientProps) {
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  
  const filter = searchParams.get("filter");
  const tag = searchParams.get("tag");
  
  // Use the current active filter in URL
  const filterType = filter === 'updates' ? 'UPDATE' :
                    filter === 'blockers' ? 'BLOCKER' :
                    filter === 'ideas' ? 'IDEA' :
                    filter === 'questions' ? 'QUESTION' : undefined;
  
  // TanStack Query for posts with filters
  const { data: posts, isLoading, isError } = usePosts({
    type: filterType,
    tag: tag || undefined,
    workspaceId: currentWorkspace?.id
  });
  
  // Fallback to initial posts until query data loads
  const displayPosts = posts || initialPosts;
  
  return (
    <div className="max-w-4xl mx-auto overflow-x-hidden">
      {tag && (
        <div className="mb-6 flex items-center">
          <p className="mr-2">Showing posts tagged:</p>
          <div className="flex items-center">
            <Badge variant="secondary" className="px-3 py-1">
              #{tag}
            </Badge>
            <Link 
              href={currentWorkspace ? `/${currentWorkspace.id}/timeline` : '#'} 
              className="ml-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear tag filter"
            >
              <XCircleIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      )}
      
      <div className="mb-6">
        <CreatePostForm />
      </div>
      
      <div className="mb-6">
        <FilterTabs />
      </div>
      
      {isLoading && initialPosts.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 text-destructive">
          <p>Something went wrong loading posts.</p>
        </div>
      ) : (
        <PostList posts={displayPosts} currentUserId={currentUserId} />
      )}
    </div>
  );
} 