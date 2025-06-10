'use client';

import { useUserBookmarks } from "@/hooks/queries/useBookmark";
import PostList from "@/components/posts/PostList";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bookmarkKeys } from "@/hooks/queries/useBookmark";

interface BookmarksClientProps {
  initialBookmarkedPosts: any[];
  currentUserId: string;
}

export default function BookmarksClient({
  initialBookmarkedPosts,
  currentUserId
}: BookmarksClientProps) {
  const queryClient = useQueryClient();
  
  // Prefill the cache with the server-fetched data
  useEffect(() => {
    if (initialBookmarkedPosts?.length) {
      // Create bookmarks structure to match what useUserBookmarks expects
      const bookmarksData = initialBookmarkedPosts.map(post => ({
        post,
        id: `bookmark-${post.id}`, // This is just a placeholder ID
        userId: currentUserId,
        postId: post.id,
        createdAt: post.createdAt
      }));
      
      queryClient.setQueryData(bookmarkKeys.list(), bookmarksData);
    }
  }, [initialBookmarkedPosts, queryClient, currentUserId]);

  // Use TanStack Query to keep bookmarks synchronized
  const { data: bookmarks, isLoading, isError } = useUserBookmarks();
  
  // Extract post data from bookmarks
  const bookmarkedPosts = bookmarks?.map(bookmark => bookmark.post) || initialBookmarkedPosts;
  
  if (isLoading && !initialBookmarkedPosts.length) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  if (isError) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>Error loading bookmarks. Please try again.</p>
        </CardContent>
      </Card>
    );
  }
  
  if (bookmarkedPosts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>You haven&apos;t bookmarked any posts yet.</p>
          <p className="text-sm mt-1">
            When you bookmark posts, they&apos;ll appear here for easy access.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <PostList 
      posts={bookmarkedPosts}
      currentUserId={currentUserId} 
    />
  );
} 