"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PostItem from "@/components/posts/PostItem";
import { PrismaPost } from "./types";
import CreateTaskButton from "./CreateTaskButton";
import LinkedTasks from "./LinkedTasks";
import { useWorkspace } from "@/context/WorkspaceContext";
import { urls } from "@/lib/url-resolver";

interface PostPageContentProps {
  post: PrismaPost;
  currentUserId: string;
}

export default function PostPageContent({ post, currentUserId }: PostPageContentProps) {
  const { currentWorkspace } = useWorkspace();
  
  // Generate back URL using URL resolver
  const getBackUrl = () => {
    if (!currentWorkspace) return "/welcome";
    
    return currentWorkspace.slug 
      ? urls.workspaceTimeline(currentWorkspace.slug)
      : `/${currentWorkspace.id}/timeline`; // Fallback for backward compatibility
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={getBackUrl()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            See All Posts
          </Link>
        </Button>
        
        <CreateTaskButton 
          postId={post.id} 
          postTitle={post.message.substring(0, 50) + (post.message.length > 50 ? '...' : '')} 
          postContent={post.message}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
      <PostItem 
        post={post}
        isExpanded={true}
        toggleExpand={() => {}}
        currentUserId={currentUserId}
      />
        </div>
        <div className="space-y-6">
          <LinkedTasks postId={post.id} />
        </div>
      </div>
    </div>
  );
} 