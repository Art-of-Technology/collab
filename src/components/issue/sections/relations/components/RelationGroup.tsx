"use client";

import type { RelationGroupProps } from "../types/relation";
import { RelationItem } from "./RelationItem";
import { getRelationConfig } from "../utils/relationConfig";

export function RelationGroup({
  relationType,
  relations,
  workspaceId,
  onRemoveRelation,
  canEdit = true,
  showInlineCreator = false,
  mode,
}: RelationGroupProps) {
  const handleRemoveRelation = (relationId: string) => {
    onRemoveRelation(relationId, relationType);
  };

  const count = relations.length;
  const config = getRelationConfig(relationType);

  // Don't render if no relations and not showing inline creator
  if (count === 0 && !showInlineCreator && relationType !== 'parent') {
    return null;
  }

  // For parent, show even if empty but with different styling
  if (relationType === 'parent' && count === 0) {
    return null;
  }

  // Sub-issues render without the header (handled in IssueRelationsSection)
  if (relationType === 'child' && showInlineCreator === false) {
    return (
      <>
        {relations.map((relation) => (
          <RelationItem
            key={relation.id}
            item={relation}
            workspaceId={workspaceId}
            relationTypeConfig={config}
            onRemove={() => handleRemoveRelation(relation.dbId)}
            canRemove={canEdit}
            compact={true}
            mode={mode}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {/* Relations List */}
      {relations.map((relation) => (
        <RelationItem
          key={relation.id}
          item={relation}
          workspaceId={workspaceId}
          relationTypeConfig={config}
          onRemove={() => handleRemoveRelation(relation.dbId)}
          canRemove={canEdit}
          compact={true}
          mode={mode}
        />
      ))}
    </>
  );
}
