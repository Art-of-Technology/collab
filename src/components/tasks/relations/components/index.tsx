"use client";

import { UnifiedRelationsSection } from './UnifiedRelationsSection';
import { 
  TaskRelationsProps,
  EpicRelationsProps,
  StoryRelationsProps,
  MilestoneRelationsProps,
  RelationsSectionProps
} from '../types';

// ============================================================================
// EXPORTED COMPONENTS (Backward Compatibility)
// ============================================================================

export function TaskRelationsSection({ task, onUpdateRelations, canEdit = true }: TaskRelationsProps) {
  return <UnifiedRelationsSection itemType="task" item={task} onUpdateRelations={onUpdateRelations} canEdit={canEdit} />;
}

export function EpicRelationsSection({ epic, canEdit = true }: EpicRelationsProps) {
  return <UnifiedRelationsSection itemType="epic" item={epic} canEdit={canEdit} />;
}

export function StoryRelationsSection({ story, canEdit = true }: StoryRelationsProps) {
  return <UnifiedRelationsSection itemType="story" item={story} canEdit={canEdit} />;
}

export function MilestoneRelationsSection({ milestone, canEdit = true }: MilestoneRelationsProps) {
  return <UnifiedRelationsSection itemType="milestone" item={milestone} canEdit={canEdit} />;
}

// ============================================================================
// MAIN RELATIONS SECTION - Router component
// ============================================================================

export function RelationsSection({ itemType, itemData, onUpdateRelations, canEdit = true }: RelationsSectionProps) {
  return <UnifiedRelationsSection itemType={itemType} item={itemData} onUpdateRelations={onUpdateRelations} canEdit={canEdit} />;
}

// ============================================================================
// COMPONENT EXPORTS
// ============================================================================

export { UnifiedRelationsSection } from './UnifiedRelationsSection';
export { RelationItem } from './RelationItem';