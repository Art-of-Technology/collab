"use client";

import { useState } from "react";
import PostItem from "@/components/posts/PostItem";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { PrismaPost } from "./types";

interface PostListProps {
  posts: PrismaPost[];
  currentUserId: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

export default function PostList({ 
  posts, 
  currentUserId, 
  hasNextPage, 
  isFetchingNextPage, 
  onLoadMore 
}: PostListProps) {
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  const toggleExpand = (postId: string) => {
    setExpandedPostId(expandedPostId === postId ? null : postId);
  };

  if (posts.length === 0) {
    return (
      <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg p-8 text-center">
        <p className="text-[#8b949e]">No posts found. Be the first to share an update!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post, index) => (
        <div key={post.id}>
          <PostItem
            post={post}
            isExpanded={expandedPostId === post.id}
            toggleExpand={toggleExpand}
            currentUserId={currentUserId}
          />
        </div>
      ))}
      
      {/* Load More Button */}
      {hasNextPage && (
        <div className="flex justify-center pt-6">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="bg-[#0e0e0e] border-[#1a1a1a] text-[#e6edf3] hover:bg-[#131313] hover:border-[#333] transition-all duration-200"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading more posts...
              </>
            ) : (
              'Load more posts'
            )}
          </Button>
        </div>
      )}
    </div>
  );
} 