export interface RichEditorProps {
  value?: string;
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  readOnly?: boolean;
  showToolbar?: boolean;
  toolbarMode?: 'static' | 'floating'; // New prop for toolbar style
  showAiImprove?: boolean;
  onAiImprove?: (text: string) => Promise<string>;
  workspaceId?: string;
  
  // Additional callbacks for enhanced functionality
  onSelectionUpdate?: (editor: any) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  additionalExtensions?: any[];
}

export interface RichEditorRef {
  focus: () => void;
  getHTML: () => string;
  getText: () => string;
  setContent: (content: string) => void;
  insertText: (text: string) => void;
  clear: () => void;
  getEditor: () => any; // Access to the underlying editor instance
}

// User mention types
export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  useCustomAvatar?: boolean;
}

// Issue mention types  
export interface Issue {
  id: string;
  title: string;
  issueKey?: string;
  type: 'TASK' | 'EPIC' | 'STORY' | 'MILESTONE' | 'SUBTASK' | 'BUG';
  status?: string;
  priority?: string;
  project?: {
    id: string;
    name: string;
    slug?: string;
    issuePrefix?: string;
  } | null;
  assignee?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

export type MentionType = 'user' | 'issue';
export type IssueType = 'TASK' | 'EPIC' | 'STORY' | 'MILESTONE' | 'SUBTASK' | 'BUG';

export interface MentionSuggestion {
  position: { top: number; left: number };
  query: string;
  type: MentionType;
}

export interface ToolbarButton {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: () => void;
  isActive?: boolean;
  disabled?: boolean;
}

export interface ToolbarGroup {
  id: string;
  buttons: ToolbarButton[];
}
