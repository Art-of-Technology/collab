// Main component
export { IssueCommentsSection } from "./IssueCommentsSection";

// Components
export { CommentItem } from "./components/CommentItem";
export { CommentForm } from "./components/CommentForm";
export { CommentReplyForm } from "./components/CommentReplyForm";
export { CommentActions } from "./components/CommentActions";
export { EmptyCommentsState } from "./components/EmptyCommentsState";
export { LoadingState } from "./components/LoadingState";

// Hooks
export { useIssueComments } from "./hooks/useIssueComments";
export { useAddIssueComment } from "./hooks/useAddIssueComment";

// Utils
export { organizeCommentsIntoTree, hasUserLikedComment, getLikeCount } from "./utils/commentHelpers";

// Types
export type {
  IssueComment,
  IssueCommentReaction,
  IssueCommentsSectionProps,
  CommentItemProps,
  CommentFormProps,
} from "./types/comment";
