import type { Post, User, Tag, Comment, Reaction } from "@prisma/client";

// Post with all relations from Prisma
export type PrismaPost = Post & {
  html?: string | null;
  resolvedAt?: Date | null;
  resolvedById?: string | null;
  author: User;
  resolvedBy?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  tags: Tag[];
  workspace?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    ownerId: string;
  } | null;
  comments: (Comment & {
    author: User;
    html?: string | null;
    reactions?: Reaction[];
    replies?: any[];
  })[];
  reactions: Reaction[];
  actions?: PostAction[];
  _count?: {
    comments: number;
    reactions: number;
  };
};

// PostAction type
export type PostAction = {
  id: string;
  postId: string;
  userId: string;
  action: string; // Will be enum when Prisma client is regenerated
  oldValue: string | null;
  newValue: string | null;
  metadata: any;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    image: string | null;
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