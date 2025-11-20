"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { IssueRelationsSectionProps, IssueRelationType, RelationItem } from "./types/relation";
import { useIssueRelations } from "./hooks/useIssueRelations";
import { useAddMultipleRelations, useRemoveRelation } from "./hooks/useRelationMutations";
import { hasAnyRelations } from "./utils/relationHelpers";
import { RelationGroup } from "./components/RelationGroup";
import { RelationsSkeleton } from "./components/RelationsSkeleton";
import { InlineIssueCreator } from "../../InlineIssueCreator";
import { calculateSubIssueProgress, getProgressBarColor } from "./utils/progressHelpers";
import { cn } from "@/lib/utils";

// Order of relation types to display (sub-issues first, then others)
const RELATION_ORDER: IssueRelationType[] = [
  'child',      // Sub-issues - most prominent
  'parent',     // Parent issue
  'blocked_by', // Blockers
  'blocks',     // What this blocks
  'relates_to', // Related issues
  'duplicates', // Duplicate issues
  'duplicated_by'
];

export function IssueRelationsSection({
  issue,
  workspaceId,
}: IssueRelationsSectionProps) {
  const [activeInlineCreator, setActiveInlineCreator] = useState<IssueRelationType | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<IssueRelationType>>(
    new Set(['child']) // Sub-issues expanded by default
  );
  const [isRelationsSectionExpanded, setIsRelationsSectionExpanded] = useState(true);

  // Data fetching
  const { data: relations, isLoading } = useIssueRelations(workspaceId, issue?.issueKey);
  
  // Mutations
  const addMultipleRelationsMutation = useAddMultipleRelations();
  const removeRelationMutation = useRemoveRelation();

  // Calculate sub-issue progress
  const subIssueProgress = useMemo(() => {
    if (!relations?.children) return null;
    return calculateSubIssueProgress(relations.children);
  }, [relations?.children]);

  // Calculate total relations count (excluding children/sub-issues)
  const relationsCount = useMemo(() => {
    if (!relations) return 0;
    let count = 0;
    if (relations.parent) count += 1;
    count += relations.blocks?.length || 0;
    count += relations.blocked_by?.length || 0;
    count += relations.relates_to?.length || 0;
    count += relations.duplicates?.length || 0;
    count += relations.duplicated_by?.length || 0;
    return count;
  }, [relations]);

  const handleAddRelation = useCallback((relationType: IssueRelationType | null) => {
    setActiveInlineCreator(relationType);
  }, []);

  const handleCancelInlineCreator = useCallback(() => {
    setActiveInlineCreator(null);
  }, []);

  const handleLinkExisting = useCallback(async (relations: Array<{item: RelationItem; relationType: IssueRelationType}>) => {
    if (!issue?.issueKey || relations.length === 0) return;

    const relationData = relations.map(rel => ({
      targetIssueId: rel.item.dbId || rel.item.id, // Use dbId (database ID) instead of id (which might be issueKey)
      relationType: rel.relationType
    }));

    await addMultipleRelationsMutation.mutateAsync({
      workspaceId,
      issueKey: issue.issueKey,
      relations: relationData
    });

    // Relations query will be invalidated automatically by the mutation
    // No need to manually refetch or call onRefresh
    setActiveInlineCreator(null);
  }, [issue?.issueKey, workspaceId, addMultipleRelationsMutation]);

  const handleRemoveRelation = useCallback(async (relationId: string, relationType: IssueRelationType) => {
    if (!issue?.issueKey) return;

    await removeRelationMutation.mutateAsync({
      workspaceId,
      issueKey: issue.issueKey,
      relationId
    });

    // Relations query will be invalidated automatically by the mutation
    // No need to manually refetch or call onRefresh
  }, [issue?.issueKey, workspaceId, removeRelationMutation]);

  const toggleGroupExpansion = useCallback((relationType: IssueRelationType) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(relationType)) {
        newSet.delete(relationType);
      } else {
        newSet.add(relationType);
      }
      return newSet;
    });
  }, []);

  if (isLoading) {
    return <RelationsSkeleton />;
  }

  const hasRelations = relations && hasAnyRelations(relations);
  const hasSubIssues = relations?.children && relations.children.length > 0;

  return (
    <div className="space-y-6">
      {/* Sub-issues Section - Most Prominent */}
      <div className="space-y-3" data-sub-issues-section>
        <div className="flex items-center justify-between">
          <button
            onClick={() => toggleGroupExpansion('child')}
            className="flex items-center gap-2 group flex-1"
          >
            {expandedGroups.has('child') ? (
              <ChevronDown className="h-4 w-4 text-[#7d8590] group-hover:text-[#c9d1d9] transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[#7d8590] group-hover:text-[#c9d1d9] transition-colors" />
            )}
            <h3 className="text-sm font-semibold text-[#e1e7ef] group-hover:text-white transition-colors">
              Sub-issues
              {hasSubIssues && (
                <span className="ml-2 text-xs text-[#7d8590] font-normal">
                  {relations.children.length}
                </span>
              )}
            </h3>
          </button>
          
          {/* Compact Progress Indicator */}
          {hasSubIssues && subIssueProgress && subIssueProgress.total > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[#e1e7ef] font-medium">{subIssueProgress.completed}</span>
                <span className="text-[#7d8590]">/</span>
                <span className="text-[#7d8590]">{subIssueProgress.total}</span>
              </div>
              <div className="w-16 h-1.5 rounded-full overflow-hidden bg-[#2d2d30]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    getProgressBarColor(subIssueProgress.percentage).bar
                  )}
                  style={{ width: `${subIssueProgress.percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {expandedGroups.has('child') && (
          <div className="space-y-2 pl-2">
            {/* Sub-issues List */}
            {hasSubIssues && (
              <div>
                <RelationGroup
                  relationType="child"
                  relations={relations.children}
                  workspaceId={relations?.workspace?.slug || workspaceId}
                  onAddRelation={handleAddRelation}
                  onRemoveRelation={handleRemoveRelation}
                  canEdit={!removeRelationMutation.isPending}
                  progress={subIssueProgress || undefined}
                  showInlineCreator={false}
                  defaultExpanded={true}
                />
              </div>
            )}

            {/* No sub-issues message */}
            {!hasSubIssues && activeInlineCreator !== 'child' && (
              <div className="text-xs text-[#6e7681] italic">
                No sub-issues yet
              </div>
            )}

            {/* Inline Creator for Sub-issues - at bottom */}
            {activeInlineCreator === 'child' ? (
              <InlineIssueCreator
                workspaceId={workspaceId}
                projectId={issue?.projectId}
                parentIssueId={issue?.id}
                parentIssueKey={issue?.issueKey}
                defaultRelationType="child"
                defaultAssigneeId={issue?.assigneeId}
                onLinkExisting={handleLinkExisting}
                onCancel={handleCancelInlineCreator}
                autoFocus={true}
              />
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAddRelation('child')}
                className="h-7 px-2 text-xs text-[#7d8590] hover:text-[#c9d1d9] hover:bg-[#1a1a1a] border border-transparent hover:border-[#333] transition-all w-full justify-start"
              >
                <span className="text-lg mr-2 leading-none">+</span>
                Add sub-issue
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      {(hasRelations || hasSubIssues) && (
        <div className="border-t border-[#1f1f1f]" />
      )}

      {/* Other Relations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsRelationsSectionExpanded(!isRelationsSectionExpanded)}
            className="flex items-center gap-2 group flex-1"
          >
            {isRelationsSectionExpanded ? (
              <ChevronDown className="h-4 w-4 text-[#7d8590] group-hover:text-[#c9d1d9] transition-colors" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[#7d8590] group-hover:text-[#c9d1d9] transition-colors" />
            )}
            <h3 className="text-sm font-semibold text-[#e1e7ef] group-hover:text-white transition-colors">
              Relations
              {relationsCount > 0 && (
                <span className="ml-2 text-xs text-[#7d8590] font-normal">
                  {relationsCount}
                </span>
              )}
            </h3>
          </button>
        </div>
        
        {isRelationsSectionExpanded && (
          <div className="pl-2">
          {RELATION_ORDER.filter(type => type !== 'child').map((relationType) => {
            const relationItems = relationType === 'parent' 
              ? (relations?.parent ? [relations.parent] : [])
              : relations?.[relationType] || [];

            const hasItems = relationItems.length > 0;

            // Skip if no items (empty sections are hidden)
            if (!hasItems) {
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
                showInlineCreator={false}
                defaultExpanded={true}
              />
            );
          })}

          {/* No relations message - only show when no relations AND creator is not active for relations */}
          {!hasRelations && (activeInlineCreator === null || activeInlineCreator === 'child') && (
            <div className="text-xs text-[#6e7681] italic">
              No relations yet
            </div>
          )}

          {/* Inline Creator at bottom - after all relation items */}
          {/* Show creator when any relation type is active (except 'child' which has its own section) */}
          {activeInlineCreator !== null && activeInlineCreator !== 'child' ? (
            <InlineIssueCreator
              workspaceId={workspaceId}
              projectId={issue?.projectId}
              parentIssueId={issue?.id}
              parentIssueKey={issue?.issueKey}
              defaultRelationType={activeInlineCreator}
              defaultAssigneeId={issue?.assigneeId}
              onLinkExisting={handleLinkExisting}
              onCancel={handleCancelInlineCreator}
              autoFocus={true}
            />
          ) : activeInlineCreator === null || activeInlineCreator === 'child' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAddRelation('relates_to')}
              className="h-7 px-2 text-xs text-[#7d8590] hover:text-[#c9d1d9] hover:bg-[#1a1a1a] border border-transparent hover:border-[#333] transition-all w-full justify-start"
            >
              <span className="text-lg mr-2 leading-none">+</span>
              Add relation
            </Button>
          ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
