"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkIcon, Plus } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useState, useEffect, useCallback } from "react";
import { UnifiedRelationsModal } from "@/components/modals/UnifiedRelationsModal";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { useRelationsApi } from "@/hooks/useRelationsApi";

import { RelationItem } from './RelationItem';
import { RELATIONS_CONFIG } from '../constants';
import { 
  UnifiedRelationsSectionProps, 
  Relations, 
  ItemType,
  RelationType 
} from '../types';

export function UnifiedRelationsSection({ 
  itemType, 
  item, 
  onUpdateRelations, 
  canEdit = true 
}: UnifiedRelationsSectionProps) {
  const { currentWorkspace } = useWorkspace();
  const relationsApi = useRelationsApi({ workspaceId: currentWorkspace?.id || '' });
  
  const config = RELATIONS_CONFIG[itemType];
  
  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    relationType: RelationType;
  }>({
    isOpen: false,
    relationType: 'EPIC'
  });
  
  // Confirmation modal states
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<{
    type: string;
    id: string;
    title: string;
    relationType: RelationType;
  } | null>(null);
  
  // Relations state
  const [relations, setRelations] = useState<Relations>({
    epics: [],
    stories: [],
    milestones: [],
    parentTasks: []
  });
  
  const [isLoading, setIsLoading] = useState(false);

  // Load relations when item changes
  useEffect(() => {
    if (item?.id && currentWorkspace?.id) {
      loadRelations();
    }
  }, [item?.id, currentWorkspace?.id]);

  const loadRelations = useCallback(async () => {
    if (!item?.id || !currentWorkspace?.id) return;
    
    try {
      setIsLoading(true);
      console.log(`🔄 Loading relations for ${itemType}:`, item.id);
      const itemRelations = await relationsApi.getTaskRelations(item.id);
      console.log('✅ Loaded relations:', itemRelations);
      setRelations(itemRelations);
    } catch (error) {
      console.error('Failed to load relations:', error);
      setRelations({ epics: [], stories: [], milestones: [], parentTasks: [] });
    } finally {
      setIsLoading(false);
    }
  }, [item?.id, currentWorkspace?.id, itemType, relationsApi]);

  // Open modal for specific relation type
  const openModal = (relationType: RelationType) => {
    setModalState({ isOpen: true, relationType });
  };

  // Handle adding relations
  const handleAddRelations = async (itemIds: string[]) => {
    try {
      console.log(`➕ Adding ${modalState.relationType.toLowerCase()}s:`, itemIds);
      
      for (const itemId of itemIds) {
        await relationsApi.addRelation(item.id, itemId, modalState.relationType);
      }
      
      await loadRelations();
      
      if (onUpdateRelations) {
        onUpdateRelations(item);
      }
    } catch (error) {
      console.error(`Failed to add ${modalState.relationType.toLowerCase()}s:`, error);
    }
  };

  // Get current relation IDs for modal
  const getCurrentRelationIds = (relationType: RelationType): string[] => {
    const relationConfig = config.availableRelations.find(r => r.type === relationType);
    if (!relationConfig) return [];
    return relations[relationConfig.key].map(item => item.id);
  };

  // Generic remove handler
  const handleRemoveRelation = (relationKey: keyof Relations, relationId: string, relationType: RelationType) => {
    const relationItem = relations[relationKey].find((r: any) => r.id === relationId);
    setConfirmationAction({
      type: relationKey,
      id: relationId,
      title: relationItem?.title || 'Item',
      relationType
    });
    setShowConfirmationModal(true);
  };

  // Confirmation handlers
  const handleConfirmDelete = async () => {
    if (!confirmationAction) return;
    
    try {
      await relationsApi.removeRelation(item.id, confirmationAction.id, confirmationAction.relationType);
      await loadRelations();
      
      if (onUpdateRelations) {
        onUpdateRelations(item);
      }
      
    } catch (error) {
      console.error("Failed to remove relation:", error);
    }
    
    setShowConfirmationModal(false);
    setConfirmationAction(null);
  };

  const handleCancelDelete = () => {
    setShowConfirmationModal(false);
    setConfirmationAction(null);
  };

  // Helper function to generate href
  const generateHref = (relationType: string, relationItem: any) => {
    if (!currentWorkspace) return "#";
    
    const config = RELATIONS_CONFIG[itemType].availableRelations.find(r => r.key === relationType);
    if (!config) return "#";
    
    if (currentWorkspace.slug && relationItem.issueKey) {
      return `/${currentWorkspace.slug}/${config.urlPath}/${relationItem.issueKey}`;
    }
    return `/${currentWorkspace.id}/${config.urlPath}/${relationItem.id}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            Loading relations...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            {itemType === 'task' ? 'Task Relations' : 'Relations'}
          </CardTitle>
          {itemType === 'task' && (
            <p className="text-sm text-muted-foreground">
              Manage relationships between this task and other items
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {config.availableRelations.map((relationConfig) => {
            const relationItems = relations[relationConfig.key];
            const count = relationItems?.length || 0;
            
            return (
              <div key={relationConfig.type}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm font-medium">
                    {relationConfig.label} {count > 0 && relationConfig.label !== 'Milestone' && relationConfig.label !== 'Epic' && `(${count})`}
                  </h4>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openModal(relationConfig.type)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {relationItems && relationItems.length > 0 ? (
                  <div className="space-y-2">
                    {relationItems.map((relationItem: any) => (
                      <RelationItem
                        key={relationItem.id}
                        title={relationItem.title}
                        type={relationConfig.key === 'parentTasks' ? 'task' : relationConfig.key.slice(0, -1) as any}
                        issueKey={relationItem.issueKey}
                        status={relationItem.status}
                        href={generateHref(relationConfig.key, relationItem)}
                        onRemove={() => handleRemoveRelation(relationConfig.key, relationItem.id, relationConfig.type)}
                        canRemove={canEdit}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    No {relationConfig.label.toLowerCase()} linked
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Unified Modal */}
      <UnifiedRelationsModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        onAdd={handleAddRelations}
        relationType={modalState.relationType}
        targetType={itemType.toUpperCase() as any}
        targetId={item.id}
        targetTitle={`${itemType.charAt(0).toUpperCase() + itemType.slice(1)}: ${item.title}`}
        currentRelations={getCurrentRelationIds(modalState.relationType)}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmationModal}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Remove Relation"
        message={
          <div>
            Are you sure you want to remove the relation to{' '}
            <strong>"{confirmationAction?.title}"</strong>?
            <br />
            <br />
            This action cannot be undone.
          </div>
        }
        confirmText="Remove"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}