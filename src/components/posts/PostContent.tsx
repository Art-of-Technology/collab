"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ChatBubbleLeftIcon, HeartIcon } from "@heroicons/react/24/outline";

type Tag = {
  id: string;
  name: string;
};

interface PostContentProps {
  message: string;
  tags: Tag[];
  likesCount: number;
  commentsCount: number;
  onToggleExpand: () => void;
}

export default function PostContent({
  message,
  tags,
  likesCount,
  commentsCount,
  onToggleExpand,
}: PostContentProps) {
  return (
    <div>
      <p className="whitespace-pre-wrap">{message}</p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/timeline?tag=${encodeURIComponent(tag.name)}`}
              className="no-underline"
            >
              <Badge key={tag.id} variant="secondary" className="text-xs hover:bg-secondary/80 transition-colors">
                #{tag.name}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
        <div className="flex gap-4">
          <span onClick={onToggleExpand}
            className="flex items-center gap-1 hover-effect px-2 py-1 rounded-md -ml-2 cursor-pointer select-none">
            <HeartIcon className="h-4 w-4" />
            {likesCount} {likesCount === 1 ? "like" : "likes"}
          </span>
          <span onClick={onToggleExpand}
            className="flex items-center gap-1 hover-effect px-2 py-1 rounded-md -ml-2 cursor-pointer select-none">
            <ChatBubbleLeftIcon className="h-4 w-4" />
            {commentsCount} {commentsCount === 1 ? "comment" : "comments"}
          </span>
        </div>
      </div>
    </div>
  );
} 