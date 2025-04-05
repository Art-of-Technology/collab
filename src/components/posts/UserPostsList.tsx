'use client';

import { useUserPosts } from "@/hooks/queries/usePost";
import PostList from "@/components/posts/PostList";
import { Card, CardContent } from "@/components/ui/card";

interface UserPostsListProps {
  userId: string;
  workspaceId: string;
  initialPosts: any[];
}

export default function UserPostsList({ 
  userId, 
  workspaceId,
  initialPosts = []
}: UserPostsListProps) {
  const { data: posts, isLoading, error } = useUserPosts(userId, workspaceId);
  
  // Use the data from query or fall back to initial posts
  const postsToShow = posts || initialPosts;
  
  if (isLoading && initialPosts.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>Error loading posts: {error instanceof Error ? error.message : "Unknown error"}</p>
        </CardContent>
      </Card>
    );
  }
  
  if (postsToShow.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <p>You haven&apos;t created any posts yet.</p>
        </CardContent>
      </Card>
    );
  }
  
  return <PostList posts={postsToShow} currentUserId={userId} />;
} 