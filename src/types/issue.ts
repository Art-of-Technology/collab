export type IssueType = 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'MILESTONE' | 'SUBTASK';

export type IssuePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type IssueStatus = string; // Dynamic based on project columns

export interface IssueLabel {
  id: string;
  name: string;
  color: string;
}

export interface IssueUser {
  id: string;
  name: string;
  email: string;
  image?: string;
  useCustomAvatar?: boolean;
  avatarAccessory?: number;
  avatarBrows?: number;
  avatarEyes?: number;
  avatarEyewear?: number;
  avatarHair?: number;
  avatarMouth?: number;
  avatarNose?: number;
  avatarSkinTone?: number;
}

export interface IssueProject {
  id: string;
  name: string;
  slug: string;
  issuePrefix: string;
}

export interface IssueColumn {
  id: string;
  name: string;
  color?: string;
  order: number;
}

export interface IssueComment {
  id: string;
  content: string;
  html?: string;
  authorId: string;
  author: IssueUser;
  createdAt: Date;
  updatedAt: Date;
  parentId?: string;
  replies?: IssueComment[];
}

export interface IssueActivity {
  id: string;
  action: string;
  details?: string;
  userId: string;
  user: IssueUser;
  createdAt: Date;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
}

export interface Issue {
  id: string;
  title: string;
  description?: string;
  type: IssueType;
  status?: string;
  priority: IssuePriority;
  storyPoints?: number;
  
  // Hierarchy
  parentId?: string;
  parent?: Issue;
  children?: Issue[];
  
  // Relationships
  assigneeId?: string;
  assignee?: IssueUser;
  reporterId?: string;
  reporter?: IssueUser;
  projectId: string;
  project?: IssueProject;
  workspaceId: string;
  columnId?: string;
  column?: IssueColumn;
  
  // Status system
  statusId?: string;
  projectStatus?: {
    id: string;
    name: string;
    displayName: string;
    color?: string;
    iconName?: string;
    order: number;
  } | null;
  
  // Dates
  dueDate?: Date;
  startDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Metadata
  issueKey?: string;
  key?: string; // Alias for issueKey for backward compatibility
  position?: number;
  progress?: number;
  color?: string;
  
  // Related data
  labels?: IssueLabel[];
  comments?: IssueComment[];
  activities?: IssueActivity[];
  
  // Legacy support
  postId?: string;
}

export interface IssueDetailProps {
  issue: Issue | null;
  error?: string | null;
  isLoading?: boolean;
  onRefresh: () => void;
  onClose?: () => void;
  boardId?: string;
}

// Time tracking interfaces
export interface PlayTime {
  totalTimeMs: number;
  formattedTime: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface IssueModalProps {
  issueId: string | null;
  onClose: () => void;
}

// Selector component props
export interface IssueSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  workspaceId?: string;
  projectId?: string;
}

// Field update types
export type IssueFieldUpdate = {
  [K in keyof Partial<Issue>]: Issue[K];
};

// API response types
export interface IssueResponse {
  issue: Issue;
  success: boolean;
  message?: string;
}

export interface IssueListResponse {
  issues: Issue[];
  total: number;
  hasMore: boolean;
}

// Time tracking (for tasks)
export interface PlayTime {
  totalTimeMs: number;
  formattedTime: string;
}