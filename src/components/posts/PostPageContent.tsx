"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PostItem from "@/components/posts/PostItem";
import { PrismaPost } from "./types";

interface PostPageContentProps {
  post: PrismaPost;
  currentUserId: string;
}

export default function PostPageContent({ post, currentUserId }: PostPageContentProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/timeline">
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