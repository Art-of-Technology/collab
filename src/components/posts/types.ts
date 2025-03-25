import type { Post, User, Tag, Comment, Reaction } from "@prisma/client";

// Post with all relations from Prisma
export type PrismaPost = Post & {
  author: User;
  tags: Tag[];
  comments: (Comment & { author: User })[];
  reactions: Reaction[];
};

// Reaction with author details
export type ReactionWithAuthor = {
  id: string;
  type: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
};

// Comment with author details
export type CommentWithAuthor = {
  id: string;
  message: string;
  createdAt: Date;
  author: User;
};

// Badge variants
export type BadgeVariant = "destructive" | "secondary" | "default" | "outline";

// Priority display object
export type PriorityDisplay = {
  text: string;
  variant: BadgeVariant;
}; 