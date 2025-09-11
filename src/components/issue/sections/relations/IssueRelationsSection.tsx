"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { IssueRelationsSectionProps, IssueRelationType, RelationItem, IssueRelations } from "./types/relation";
import { useIssueRelations } from "./hooks/useIssueRelations";
import { useAddMultipleRelations, useRemoveRelation } from "./hooks/useRelationMutations";
import { hasAnyRelations } from "./utils/relationHelpers";
import { RelationGroup } from "./components/RelationGroup";
import { AddRelationModal } from "./components/AddRelationModal";
import { EmptyRelationsState } from "./components/EmptyRelationsState";
import { LoadingState } from "./components/LoadingState";

// Order of relation types to display
const RELATION_ORDER: IssueRelationType[] = [
  'parent',
  'child',
  'blocked_by',
  'blocks',
  'relates_to',
  'duplicates',
  'duplicated_by'
];

export function IssueRelationsSection({
  issue,
  workspaceId,
  currentUserId,
  onRefresh
}: IssueRelationsSectionProps) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    relationType: IssueRelationType;
  }>({
    isOpen: false,
    relationType: 'child'
  });

  // Data fetching
  const { data: relations, isLoading, refetch } = useIssueRelations(workspaceId, issue?.issueKey);
  
  // Mutations
  const addMultipleRelationsMutation = useAddMultipleRelations();
  const removeRelationMutation = useRemoveRelation();

  const handleAddRelation = useCallback((relationType: IssueRelationType) => {
    setModalState({
      isOpen: true,
      relationType
    });
  }, []);

  const handleAddRelations = useCallback(async (relations: Array<{item: RelationItem; relationType: IssueRelationType}>) => {
    if (!issue?.issueKey || relations.length === 0) return;

    const relationData = relations.map(rel => ({
      targetIssueId: rel.item.id,
      relationType: rel.relationType
    }));

    await addMultipleRelationsMutation.mutateAsync({
      workspaceId,
      issueKey: issue.issueKey,
      relations: relationData
    });

    // Refresh data
    refetch();
    onRefresh?.();
  }, [issue?.issueKey, workspaceId, addMultipleRelationsMutation, refetch, onRefresh]);

  const handleRemoveRelation = useCallback(async (relationId: string, relationType: IssueRelationType) => {
    if (!issue?.issueKey) return;

    await removeRelationMutation.mutateAsync({
      workspaceId,
      issueKey: issue.issueKey,
      relationId
    });

    // Refresh data
    refetch();
    onRefresh?.();
  }, [issue?.issueKey, workspaceId, removeRelationMutation, refetch, onRefresh]);

  const handleCloseModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleAddFromEmpty = useCallback(() => {
    // Default to adding a child relation when clicking from empty state
    handleAddRelation('child');
  }, [handleAddRelation]);

  // Get existing relation IDs for the current modal type
  const getExistingRelationIds = useCallback(() => {
    if (!relations) return [];
    
    const relationType = modalState.relationType;
    if (relationType === 'parent') {
      return relations.parent ? [relations.parent.id] : [];
    }
    
    // Map 'child' to 'children' for the interface
    const relationKey = relationType === 'child' ? 'children' : relationType;
    const relationArray = relations[relationKey as keyof Omit<IssueRelations, 'parent' | 'workspace'>] as RelationItem[] | undefined;
    return relationArray?.map(item => item.id) || [];
  }, [relations, modalState.relationType]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (!relations || !hasAnyRelations(relations)) {
    return (
      <div>
        <EmptyRelationsState 
          onAddRelation={handleAddFromEmpty}
          canEdit={true}
        />
        
        {/* Add relation modal */}
        <AddRelationModal
          isOpen={modalState.isOpen}
          onClose={handleCloseModal}
          onAdd={handleAddRelations}
          relationType={modalState.relationType}
          workspaceId={workspaceId}
          currentIssueId={issue?.id}
          excludeIds={getExistingRelationIds()}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1.5">
        {RELATION_ORDER.map((relationType) => {
          const relationItems = relationType === 'parent' 
            ? (relations.parent ? [relations.parent] : [])
            : relations[relationType === 'child' ? 'children' : relationType] || [];

          // Show parent even if empty, skip others if empty
          if (relationItems.length === 0 && relationType !== 'parent') {
            return null;
          }

          return (
            <RelationGroup
              key={relationType}
              relationType={relationType}
              relations={relationItems}
              workspaceId={relations?.workspace?.slug || workspaceId}
              onAddRelation={handleAddRelation}
              onRemoveRelation={handleRemoveRelation}
              canEdit={!removeRelationMutation.isPending}
            />
          );
        })}
      </div>

      {/* Add relation button */}
      <div className="flex justify-end mt-6 pt-4 border-t border-[#1f1f1f]">
        <Button 
          variant="outline" 
          size="sm" 
          className="border-[#333] hover:bg-[#1a1a1a] hover:border-[#444] text-[#ccc]"
          onClick={handleAddFromEmpty}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Relation
        </Button>
      </div>

      {/* Add relation modal */}
      <AddRelationModal
        isOpen={modalState.isOpen}
        onClose={handleCloseModal}
        onAdd={handleAddRelations}
        relationType={modalState.relationType}
        workspaceId={workspaceId}
        currentIssueId={issue?.id}
        excludeIds={getExistingRelationIds()}
      />
    </div>
  );
}
