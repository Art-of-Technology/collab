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
interface Post {
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

// Project model
interface Project {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  workspace?: {
    id: string;
    name: string;
    slug: string;
  };
  _count?: {
    tasks: number;
    epics: number;
    milestones: number;
    stories: number;
    boardProjects: number;
  };
  boardProjects?: BoardProject[];
}

// BoardProject model
interface BoardProject {
  id: string;
  boardId: string;
  projectId: string;
  createdAt: Date;
  board?: {
    id: string;
    name: string;
    description: string | null;
  };
  project?: Project;
}

// BoardShare model
interface BoardShare {
  id: string;
  boardId: string;
  orgId: string;
  permissionLevel: 'VIEW' | 'EDIT' | 'ADMIN';
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: Date;
  updatedAt: Date;
  board?: {
    id: string;
    name: string;
    description: string | null;
  };
  sharedWithOrg?: {
    id: string;
    name: string;
    slug: string;
  };
}