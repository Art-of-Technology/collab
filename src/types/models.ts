// Type definitions for models used in the application

// User model
export interface User {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  hashedPassword: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: string;
  team: string | null;
  currentFocus: string | null;
  expertise: string[];
  slackId: string | null;
  
  // Custom avatar fields
  avatarSkinTone?: number | null;
  avatarEyes?: number | null;
  avatarBrows?: number | null;
  avatarMouth?: number | null;
  avatarNose?: number | null;
  avatarHair?: number | null;
  avatarEyewear?: number | null;
  avatarAccessory?: number | null;
  useCustomAvatar?: boolean;
}

// Post model
export interface Post {
  id: string;
  message: string;
  type: string; // 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION' | 'RESOLVED'
  priority: string; // 'normal' | 'high' | 'critical'
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  isAutomated: boolean;
}

// Tag model
export interface Tag {
  id: string;
  name: string;
  color?: string;
}

// Note model
export interface Note {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image?: string;
  };
  tags: {
    id: string;
    name: string;
    color: string;
  }[];
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
}

// NoteTag model (Tag with usage count)
export interface NoteTag {
  id: string;
  name: string;
  color: string;
  _count: {
    notes: number;
  };
}

// Comment model
export interface Comment {
  id: string;
  message: string;
  authorId: string;
  postId: string;
  createdAt: Date;
  updatedAt: Date;
  author: User;
}

// Reaction model
export interface Reaction {
  id: string;
  type: string; // 'LIKE' | 'BOOKMARK'
  authorId: string;
  postId: string | null;
  commentId: string | null;
} 