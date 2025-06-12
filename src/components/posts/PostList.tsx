"use client";

import { useState } from "react";
import PostItem from "@/components/posts/PostItem";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PrismaPost } from "./types";

interface PostListProps {
  posts: PrismaPost[];
  currentUserId: string;
}

export default function PostList({ posts, currentUserId }: PostListProps) {
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);

  const toggleExpand = (postId: string) => {
    setExpandedPostId(expandedPostId === postId ? null : postId);
  };

  if (posts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CardContent className="text-muted-foreground">
          <p>No posts found. Be the first to share an update!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <div key={post.id}>
          <PostItem
            post={post}
            isExpanded={expandedPostId === post.id}
            toggleExpand={toggleExpand}
            currentUserId={currentUserId}
          />
          {post !== posts[posts.length - 1] && <Separator className="my-4" />}
        </div>
      ))}
    </div>
  );
} 