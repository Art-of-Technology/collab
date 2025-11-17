"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { IssueRelationsSectionProps, IssueRelationType, RelationItem, IssueRelations } from "./types/relation";
import { useIssueRelations } from "./hooks/useIssueRelations";
import { useAddMultipleRelations, useRemoveRelation } from "./hooks/useRelationMutations";
import { hasAnyRelations } from "./utils/relationHelpers";
import { RelationGroup } from "./components/RelationGroup";
import { LoadingState } from "./components/LoadingState";
import { InlineIssueCreator } from "../../InlineIssueCreator";
import { ProgressBarWithLabel } from "./components/ProgressBar";
import { calculateSubIssueProgress } from "./utils/progressHelpers";
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
  currentUserId,
  onRefresh
}: IssueRelationsSectionProps) {
  const [activeInlineCreator, setActiveInlineCreator] = useState<IssueRelationType | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<IssueRelationType>>(
    new Set(['child']) // Sub-issues expanded by default
  );

  // Data fetching
  const { data: relations, isLoading, refetch } = useIssueRelations(workspaceId, issue?.issueKey);
  
  // Mutations
  const addMultipleRelationsMutation = useAddMultipleRelations();
  const removeRelationMutation = useRemoveRelation();

  // Calculate sub-issue progress
  const subIssueProgress = useMemo(() => {
    if (!relations?.children) return null;
    return calculateSubIssueProgress(relations.children);
  }, [relations?.children]);

  const handleAddRelation = useCallback((relationType: IssueRelationType | null) => {
    setActiveInlineCreator(relationType);
  }, []);

  const handleCancelInlineCreator = useCallback(() => {
    setActiveInlineCreator(null);
  }, []);

  const handleIssueCreated = useCallback(async (issueId: string, issueKey: string) => {
    // Refresh data
    refetch();
    onRefresh?.();
    // Keep inline creator open for quick successive creation
  }, [refetch, onRefresh]);

  const handleLinkExisting = useCallback(async (relations: Array<{item: RelationItem; relationType: IssueRelationType}>) => {
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
    setActiveInlineCreator(null);
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
    return <LoadingState />;
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
            className="flex items-center gap-2 group"
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
        </div>

        {expandedGroups.has('child') && (
          <div className="space-y-3 pl-6">
            {/* Progress Bar */}
            {hasSubIssues && subIssueProgress && subIssueProgress.total > 0 && (
              <div className="space-y-1">
                <ProgressBarWithLabel
                  completed={subIssueProgress.completed}
                  total={subIssueProgress.total}
                  className="mb-3"
                />
              </div>
            )}

            {/* Sub-issues List */}
            {hasSubIssues && (
              <div className="space-y-1.5">
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

            {/* Inline Creator for Sub-issues - at bottom */}
            {activeInlineCreator === 'child' ? (
              <InlineIssueCreator
                workspaceId={workspaceId}
                projectId={issue?.projectId}
                parentIssueId={issue?.id}
                parentIssueKey={issue?.issueKey}
                defaultRelationType="child"
                defaultAssigneeId={issue?.assigneeId}
                onIssueCreated={handleIssueCreated}
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

            {!hasSubIssues && activeInlineCreator !== 'child' && (
              <div className="text-xs text-[#6e7681] italic py-2">
                No sub-issues yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      {(hasRelations || hasSubIssues) && (
        <div className="border-t border-[#1f1f1f]" />
      )}

      {/* Other Relations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#e1e7ef]">Relations</h3>
        </div>
        
        <div className="space-y-3 pl-6">
          {RELATION_ORDER.filter(type => type !== 'child').map((relationType) => {
            const relationItems = relationType === 'parent' 
              ? (relations?.parent ? [relations.parent] : [])
              : relations?.[relationType] || [];

            const hasItems = relationItems.length > 0;
            const isExpanded = expandedGroups.has(relationType);
            const isCreating = activeInlineCreator === relationType;

            // Skip if no items and not creating
            if (!hasItems && !isCreating) {
              return null;
            }

            return (
              <div key={relationType} className="space-y-2">
                <button
                  onClick={() => toggleGroupExpansion(relationType)}
                  className="flex items-center gap-2 group w-full"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-[#7d8590] group-hover:text-[#c9d1d9] transition-colors" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-[#7d8590] group-hover:text-[#c9d1d9] transition-colors" />
                  )}
                  <span className="text-xs text-[#c9d1d9] group-hover:text-[#e1e7ef] transition-colors capitalize">
                    {relationType.replace('_', ' ')}
                    {hasItems && (
                      <span className="ml-1.5 text-[#7d8590]">
                        ({relationItems.length})
                      </span>
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="pl-5 space-y-2">
                    {/* Inline Creator */}
                    {isCreating ? (
                      <InlineIssueCreator
                        workspaceId={workspaceId}
                        projectId={issue?.projectId}
                        parentIssueId={issue?.id}
                        parentIssueKey={issue?.issueKey}
                        defaultRelationType={relationType}
                        defaultAssigneeId={issue?.assigneeId}
                        onIssueCreated={handleIssueCreated}
                        onLinkExisting={handleLinkExisting}
                        onCancel={handleCancelInlineCreator}
                        autoFocus={true}
                      />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddRelation(relationType)}
                        className="h-6 px-2 text-xs text-[#7d8590] hover:text-[#c9d1d9] hover:bg-[#1a1a1a] border border-transparent hover:border-[#333] transition-all w-full justify-start"
                      >
                        <span className="text-base mr-1.5 leading-none">+</span>
                        Add {relationType === 'parent' ? 'parent' : relationType.replace('_', ' ')}
                      </Button>
                    )}

                    {/* Relations List */}
                    {hasItems && (
                      <RelationGroup
                        relationType={relationType}
                        relations={relationItems}
                        workspaceId={relations?.workspace?.slug || workspaceId}
                        onAddRelation={handleAddRelation}
                        onRemoveRelation={handleRemoveRelation}
                        canEdit={!removeRelationMutation.isPending}
                        showInlineCreator={false}
                        defaultExpanded={true}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Inline Creator at bottom - after all relation items */}
          {activeInlineCreator === null ? (
            <InlineIssueCreator
              workspaceId={workspaceId}
              projectId={issue?.projectId}
              parentIssueId={issue?.id}
              parentIssueKey={issue?.issueKey}
              defaultRelationType="relates_to"
              defaultAssigneeId={issue?.assigneeId}
              onIssueCreated={handleIssueCreated}
              onLinkExisting={handleLinkExisting}
              onCancel={handleCancelInlineCreator}
              autoFocus={true}
            />
          ) : !hasRelations && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAddRelation(null)}
              className="h-7 px-2 text-xs text-[#7d8590] hover:text-[#c9d1d9] hover:bg-[#1a1a1a] border border-transparent hover:border-[#333] transition-all w-full justify-start"
            >
              <span className="text-lg mr-2 leading-none">+</span>
              Add relation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
