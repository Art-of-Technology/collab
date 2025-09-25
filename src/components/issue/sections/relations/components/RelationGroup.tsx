"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUp, ArrowDown, Shield, ShieldAlert, Link2, Copy } from "lucide-react";
import type { RelationGroupProps, IssueRelationType } from "../types/relation";
import { RelationItem } from "./RelationItem";
import { getRelationConfig, getRelationCountText } from "../utils/relationConfig";

const RELATION_ICONS: Record<IssueRelationType, React.ComponentType<{ className?: string }>> = {
  parent: ArrowUp,
  child: ArrowDown,
  blocks: Shield,
  blocked_by: ShieldAlert,
  relates_to: Link2,
  duplicates: Copy,
  duplicated_by: Copy,
};

const RELATION_COLORS: Record<IssueRelationType, string> = {
  parent: "bg-blue-500",
  child: "bg-green-500",
  blocks: "bg-red-500",
  blocked_by: "bg-orange-500",
  relates_to: "bg-purple-500",
  duplicates: "bg-gray-500",
  duplicated_by: "bg-gray-500",
};

export function RelationGroup({
  relationType,
  relations,
  workspaceId,
  onAddRelation,
  onRemoveRelation,
  canEdit = true
}: RelationGroupProps) {
  const config = getRelationConfig(relationType);
  const colorClass = RELATION_COLORS[relationType];
  const count = relations.length;
  const countText = getRelationCountText(relationType, count);

  const handleAddRelation = () => {
    console.log('relationType', relationType);
    onAddRelation(relationType);
  };

  const handleRemoveRelation = (relationId: string) => {
    onRemoveRelation(relationId, relationType);
  };

  // Don't render if no relations and it's a parent type (parent can be empty)
  if (count === 0 && relationType !== 'parent') {
    return null;
  }

  // For parent, show even if empty but with different styling
  if (relationType === 'parent' && count === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 ${colorClass} rounded-full`}></div>
          <h4 className="text-xs font-medium text-[#ccc] uppercase tracking-wide">
            {config.label}
          </h4>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-[#666] hover:text-[#ccc] transition-colors ml-auto"
              onClick={handleAddRelation}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="text-xs text-[#666] italic ml-4">
          No parent issue
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 ${colorClass} rounded-full`}></div>
        <h4 className="text-xs font-medium text-[#ccc] uppercase tracking-wide">
          {config.label}
        </h4>
        {countText && (
          <Badge className="bg-[#333] text-[#ccc] text-xs px-1.5 py-0.5">
            {countText}
          </Badge>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-[#666] hover:text-[#ccc] transition-colors ml-auto"
            onClick={handleAddRelation}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      <div className="space-y-1.5">
        {relations.map((relation) => (
          <RelationItem
            key={relation.id}
            item={relation}
            workspaceId={workspaceId}
            relationType={relationType}
            onRemove={() => handleRemoveRelation(relation.dbId)}
            canRemove={canEdit}
            compact={true}
          />
        ))}
      </div>
    </div>
  );
}
