// Task-related type definitions

export interface TaskComment {
  id: string;
  content: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
    avatarSkinTone?: number | null;
    avatarEyes?: number | null;
    avatarBrows?: number | null;
    avatarMouth?: number | null;
    avatarNose?: number | null;
    avatarHair?: number | null;
    avatarEyewear?: number | null;
    avatarAccessory?: number | null;
  };
  html?: string | null;
  parentId?: string | null;
  reactions?: {
    id: string;
    type: string;
    authorId: string;
    author?: {
      id: string;
      name?: string | null;
      image?: string | null;
      useCustomAvatar?: boolean;
    };
  }[];
  replies?: TaskComment[];
}

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export interface TaskAttachment {
  id: string;
  name?: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: string | null;
  priority: string;
  type: string;
  createdAt: Date;
  comments: TaskComment[];
  labels: TaskLabel[];
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  } | null;
  reporter?: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  } | null;
  column?: {
    id: string;
    name: string;
  };
  taskBoard?: {
    id: string;
    name: string;
  };
  attachments: TaskAttachment[];
  dueDate?: Date;
  storyPoints?: number;
  issueKey?: string | null;
  columnId?: string;
  workspaceId: string;
  milestoneId?: string;
  milestone?: {
    id: string;
    title: string;
  };
  epicId?: string;
  epic?: {
    id: string;
    title: string;
  };
  storyId?: string;
  story?: {
    id: string;
    title: string;
  };
  parentTaskId?: string;
  parentTask?: {
    id: string;
    title: string;
    issueKey?: string;
  };
  subtasks?: {
    id: string;
    title: string;
    issueKey?: string;
    status: string;
  }[];
}

export interface TaskDetailContentProps {
  task: Task | null;
  error: string | null;
  onRefresh: () => void;
  showHeader?: boolean;
  onClose?: () => void;
  boardId?: string;
}

export interface TaskActivity {
  id: string;
  action: string;
  details: string | null; // JSON string
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
    avatarSkinTone?: number | null;
    avatarEyes?: number | null;
    avatarBrows?: number | null;
    avatarMouth?: number | null;
    avatarNose?: number | null;
    avatarHair?: number | null;
    avatarEyewear?: number | null;
    avatarAccessory?: number | null;
  };
}

export interface PlayTime {
  totalTimeMs: number;
  formattedTime: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export type PlayState = "stopped" | "playing" | "paused"; 