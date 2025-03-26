import type { Post, User, Tag, Comment, Reaction } from "@prisma/client";

// Post with all relations from Prisma
export type PrismaPost = Post & {
  html?: string | null;
  author: User;
  tags: Tag[];
  comments: (Comment & {
    author: User;
    html?: string | null;
    reactions?: Reaction[];
    replies?: any[];
  })[];
  reactions: Reaction[];
  _count?: {
    comments: number;
    reactions: number;
  };
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
  html?: string | null;
  createdAt: Date;
  author: User;
  reactions?: Reaction[];
  parentId?: string | null;
  replies?: CommentWithAuthor[];
};

// Badge variants
export type BadgeVariant = "destructive" | "secondary" | "default" | "outline";

// Priority display object
export type PriorityDisplay = {
  text: string;
  variant: BadgeVariant;
}; 