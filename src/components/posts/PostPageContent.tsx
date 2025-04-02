"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PostItem from "@/components/posts/PostItem";
import { PrismaPost } from "./types";
import CreateTaskButton from "./CreateTaskButton";
import LinkedTasks from "./LinkedTasks";

interface PostPageContentProps {
  post: PrismaPost;
  currentUserId: string;
}

export default function PostPageContent({ post, currentUserId }: PostPageContentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/timeline">
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