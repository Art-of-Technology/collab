"use client";

import { useState } from "react";
import Link from "next/link";
import { usePostReactions } from "@/hooks/queries/useReaction";

type ReactionWithAuthor = {
  id: string;
  type: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
};

interface LikesSummaryProps {
  likesCount: number;
  likesWithAuthor: ReactionWithAuthor[];
  onShowAllLikes: () => void;
  postId: string;
}

export default function LikesSummary({ likesCount, likesWithAuthor: initialLikes, onShowAllLikes, postId }: LikesSummaryProps) {
  // Use TanStack Query for reactions, but only if we need to fetch them
  const shouldFetch = initialLikes.length === 0 && likesCount > 0;
  const { data, isLoading } = usePostReactions(postId);
  
  // Use initial likes if provided, otherwise use the data from the query
  const likesWithAuthor = initialLikes.length > 0 
    ? initialLikes 
    : data?.reactions?.filter((reaction: any) => reaction.type === "LIKE") || [];

  // Get a formatted summary of who liked the post
  const renderLikesSummary = () => {
    if (isLoading && shouldFetch) {
      return `${likesCount} ${likesCount === 1 ? "person" : "people"} liked this`;
    }

    // Instagram-style summary
    if (likesWithAuthor.length === 0) {
      return "Be the first to like this post";
    } else if (likesWithAuthor.length === 1) {
      return (
        <span>
          Liked by{" "}
          <Link href={`/profile/${likesWithAuthor[0].author.id}`} className="font-semibold hover:underline">
            {likesWithAuthor[0].author.name}
          </Link>
        </span>
      );
    } else if (likesWithAuthor.length === 2) {
      return (
        <span>
          Liked by{" "}
          <Link href={`/profile/${likesWithAuthor[0].author.id}`} className="font-semibold hover:underline">
            {likesWithAuthor[0].author.name}
          </Link>{" "}
          and{" "}
          <Link href={`/profile/${likesWithAuthor[1].author.id}`} className="font-semibold hover:underline">
            {likesWithAuthor[1].author.name}
          </Link>
        </span>
      );
    } else if (likesWithAuthor.length > 2) {
      return (
        <span>
          Liked by{" "}
          <Link href={`/profile/${likesWithAuthor[0].author.id}`} className="font-semibold hover:underline">
            {likesWithAuthor[0].author.name}
          </Link>{" "}
          and{" "}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowAllLikes();
            }}
            className="font-semibold hover:underline"
          >
            {likesWithAuthor.length - 1} others
          </button>
        </span>
      );
    }

    return "No likes yet";
  };

  return (
    <div
      className="text-muted-foreground text-sm mb-4 cursor-pointer hover:text-foreground transition-colors"
      onClick={() => {
        if (likesWithAuthor.length > 0) {
          onShowAllLikes();
        }
      }}
    >
      {renderLikesSummary()}
    </div>
  );
} 