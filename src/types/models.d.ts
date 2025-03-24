// Type definitions for models used in the application

// User model
interface User {
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
}

// Post model
interface Post {
  id: string;
  message: string;
  type: string; // 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION'
  priority: string; // 'normal' | 'high' | 'critical'
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  isAutomated: boolean;
}

// Tag model
interface Tag {
  id: string;
  name: string;
}

// Comment model
interface Comment {
  id: string;
  message: string;
  authorId: string;
  postId: string;
  createdAt: Date;
  updatedAt: Date;
  author: User;
}

// Reaction model
interface Reaction {
  id: string;
  type: string; // 'LIKE' | 'BOOKMARK'
  authorId: string;
  postId: string | null;
  commentId: string | null;
} 