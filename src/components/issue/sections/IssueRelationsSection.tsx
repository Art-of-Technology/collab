// Re-export the refactored IssueRelationsSection from the new modular structure
export { IssueRelationsSection } from "./relations/IssueRelationsSection";

// Re-export types for backward compatibility
export type {
  IssueRelationType,
  RelatedItemType,
  RelationItem,
  IssueRelations,
  IssueRelationsSectionProps,
} from "./relations/types/relation";
