// Main component
export { IssueRelationsSection } from "./IssueRelationsSection";

// Components
export { RelationGroup } from "./components/RelationGroup";
export { AddRelationModal } from "./components/AddRelationModal";
export { SearchRelationItem } from "./components/SearchRelationItem";
export { EmptyRelationsState } from "./components/EmptyRelationsState";
export { LoadingState } from "./components/LoadingState";

// Hooks
export { useIssueRelations } from "./hooks/useIssueRelations";
export { useAddRelation, useRemoveRelation, useAddMultipleRelations } from "./hooks/useRelationMutations";
export { useRelationSearch, useRelationFilterOptions, useDebouncedRelationSearch } from "./hooks/useRelationSearch";

// Utils
export { 
  organizeRelationsData, 
  hasAnyRelations, 
  getTotalRelationsCount,
  getItemTypeBadgeStyle,
  getStatusBadgeStyle,
  getPriorityBadgeStyle,
  formatRelationTypeLabel
} from "./utils/relationHelpers";

export { 
  getRelationConfig, 
  getRelationItemUrl, 
  getRelationCountText, 
  canHaveMultipleRelations,
  RELATION_CONFIGS
} from "./utils/relationConfig";

// Types
export type {
  IssueRelationType,
  RelatedItemType,
  RelationItem,
  IssueRelations,
  RelationConfig,
  IssueRelationsSectionProps,
  RelationItemProps,
  RelationGroupProps,
  AddRelationModalProps,
  SearchRelationItemProps,
  RelationSearchFilters,
} from "./types/relation";
