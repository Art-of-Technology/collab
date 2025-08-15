// Re-export the refactored IssueCommentsSection from the new modular structure
export { IssueCommentsSection } from "./comments/IssueCommentsSection";

// Re-export types for backward compatibility
export type {
  IssueComment,
  IssueCommentReaction,
  IssueCommentsSectionProps,
} from "./comments/types/comment";
