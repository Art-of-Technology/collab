"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PostItem from "@/components/posts/PostItem";
import { PrismaPost } from "./types";
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
      </div>

      <PostItem
        post={post}
        isExpanded={true}
        toggleExpand={() => {}}
        currentUserId={currentUserId}
      />
    </div>
  );
} 