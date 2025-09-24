export interface IssueComment {
  id: string;
  content: string;
  html?: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
  };
  reactions: IssueCommentReaction[];
  parentId?: string | null;
  replies?: IssueComment[];
}

export interface IssueCommentReaction {
  id: string;
  type: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export interface IssueCommentsSectionProps {
  issueId: string;
  initialComments?: IssueComment[];
  currentUserId?: string;
  workspaceId?: string;
  autofocus?: boolean;
}

export interface CommentItemProps {
  comment: IssueComment;
  issueId: string;
  currentUserId?: string;
  onReply: (parentId: string) => void;
  level?: number;
}

export interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  isLoading?: boolean;
  workspaceId?: string;
  showUserInfo?: boolean;
  autofocus?: boolean;
}
