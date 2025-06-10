'use client';

import { usePostById } from "@/hooks/queries/usePost";
import PostPageContent from "@/components/posts/PostPageContent";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";

interface PostDetailClientProps {
  postId: string;
  initialPost: any;
  currentUserId: string;
}

export default function PostDetailClient({
  postId,
  initialPost,
  currentUserId,
}: PostDetailClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { data: post, isLoading, error } = usePostById(postId);
  
  useEffect(() => {
    if (error) {
      // If there's an error (like unauthorized access), redirect to the workspace dashboard
      const dashboardPath = currentWorkspace ? `/${currentWorkspace.id}/dashboard` : '/welcome';
      router.push(dashboardPath);
    }
  }, [error, router, currentWorkspace]);

  // Use the data from query or fall back to initial post
  const postToShow = post || initialPost;
  
  if (isLoading && !initialPost) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return <PostPageContent post={postToShow} currentUserId={currentUserId} />;
} 