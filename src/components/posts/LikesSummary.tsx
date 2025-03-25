"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  postId: string; // Added postId to fetch likes if needed
}

export default function LikesSummary({ likesCount, likesWithAuthor: initialLikes, onShowAllLikes, postId }: LikesSummaryProps) {
  const [likesWithAuthor, setLikesWithAuthor] = useState<ReactionWithAuthor[]>(initialLikes);
  const [isLoading, setIsLoading] = useState(initialLikes.length === 0 && likesCount > 0);

  // Fetch likes data if not provided but we know there are likes
  useEffect(() => {
    const fetchLikesData = async () => {
      if (initialLikes.length === 0 && likesCount > 0) {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/posts/${postId}/reactions`);

          if (!response.ok) {
            throw new Error("Failed to fetch likes");
          }

          const data = await response.json();
          // Filter only LIKE reactions and include author details
          const likes = data.reactions.filter((reaction: ReactionWithAuthor) =>
            reaction.type === "LIKE"
          );

          setLikesWithAuthor(likes);
        } catch (error) {
          console.error("Failed to get likes:", error);
          // Don't show toast for this silent fetch
        } finally {
          setIsLoading(false);
        }
      }
    };

    fetchLikesData();
  }, [initialLikes, likesCount, postId]);

  // Update state when props change
  useEffect(() => {
    if (initialLikes.length > 0) {
      setLikesWithAuthor(initialLikes);
      setIsLoading(false);
    }
  }, [initialLikes]);

  // Get a formatted summary of who liked the post
  const renderLikesSummary = () => {
    if (isLoading) {
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