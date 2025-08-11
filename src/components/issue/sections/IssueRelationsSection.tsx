"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon, Plus, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface RelationItem {
  id: string;
  title: string;
  issueKey?: string;
  status?: string;
  type: 'epic' | 'story' | 'task' | 'milestone' | 'subtask';
}

interface IssueRelations {
  parent?: RelationItem;
  children: RelationItem[];
  blocked: RelationItem[];
  blocking: RelationItem[];
  related: RelationItem[];
}

interface IssueRelationsSectionProps {
  issue: any;
  workspaceId: string;
  onRefresh?: () => void;
}

function RelationItem({ 
  item, 
  workspaceId, 
  onRemove, 
  canRemove = false 
}: { 
  item: RelationItem; 
  workspaceId: string; 
  onRemove?: () => void; 
  canRemove?: boolean; 
}) {
  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'milestone':
        return "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";
      case 'epic':
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case 'story':
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case 'task':
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case 'subtask':
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const statusColors: Record<string, string> = {
      'DONE': 'bg-green-500/20 text-green-400 border-green-500/30',
      'IN_PROGRESS': 'bg-blue-500/20 text-blue-400 border-blue-500/30', 
      'IN PROGRESS': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'TODO': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      'BACKLOG': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };
    
    const colorClass = statusColors[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    
    return (
      <Badge className={`${colorClass} text-xs`}>
        {status}
      </Badge>
    );
  };

  const getItemUrl = (item: RelationItem) => {
    // For issues, use the issueKey-based URL format
    if (item.issueKey) {
      return `/${workspaceId}/issues/${item.issueKey}`;
    }
    
    // Fallback for other types or items without issueKey
    const baseUrl = `/${workspaceId}/views`;
    switch (item.type) {
      case 'epic':
        return `${baseUrl}/epics/${item.id}`;
      case 'story':
        return `${baseUrl}/stories/${item.id}`;
      case 'task':
      case 'subtask':
        return `${baseUrl}/tasks/${item.id}`;
      case 'milestone':
        return `${baseUrl}/milestones/${item.id}`;
      default:
        return `${baseUrl}/${item.id}`;
    }
  };

  return (
    <div className="group relative border border-[#1f1f1f] rounded-lg hover:border-[#333] transition-colors">
      <Link 
        href={getItemUrl(item)}
        className="flex items-center gap-3 p-3 hover:bg-[#0d0d0d] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Badge className={`${getBadgeStyle(item.type)} text-xs font-medium`}>
            {item.issueKey || item.type.toUpperCase()}
          </Badge>
          <span className="truncate text-[#e1e7ef] font-medium text-sm">{item.title}</span>
          {getStatusBadge(item.status)}
        </div>
        <ExternalLink className="h-3 w-3 text-[#666] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </Link>
      {canRemove && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-6 w-6 p-0 text-[#666] hover:text-red-400 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export function IssueRelationsSection({ 
  issue, 
  workspaceId, 
  onRefresh 
}: IssueRelationsSectionProps) {
  const [relations, setRelations] = useState<IssueRelations>({
    children: [],
    blocked: [],
    blocking: [],
    related: []
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load relations
  useEffect(() => {
    const loadRelations = async () => {
      try {
        setLoading(true);
        
        // For now, use the issue data directly - in a real implementation,
        // you'd fetch full relations data from an API
        const issueRelations: IssueRelations = {
          parent: issue.parent ? {
            id: issue.parent.id,
            title: issue.parent.title,
            issueKey: issue.parent.issueKey,
            status: issue.parent.status,
            type: issue.parent.type?.toLowerCase() || 'task'
          } : undefined,
          children: issue.children?.map((child: any) => ({
            id: child.id,
            title: child.title,
            issueKey: child.issueKey,
            status: child.status,
            type: child.type?.toLowerCase() || 'subtask'
          })) || [],
          blocked: [], // TODO: Implement blocked relations
          blocking: [], // TODO: Implement blocking relations
          related: [] // TODO: Implement related relations
        };
        
        setRelations(issueRelations);
      } catch (error) {
        console.error('Failed to load relations:', error);
        toast({
          title: "Error",
          description: "Failed to load issue relations",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    if (issue?.id) {
      loadRelations();
    }
  }, [issue, toast]);

  const handleRemoveRelation = async (relationId: string, relationType: string) => {
    try {
      // TODO: Implement relation removal API call
      const response = await fetch(`/api/issues/${issue.id}/relations/${relationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ relationType })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Relation removed successfully",
        });
        onRefresh?.();
      } else {
        throw new Error('Failed to remove relation');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove relation",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const hasAnyRelations = !!(
    relations.parent || 
    relations.children.length > 0 ||
    relations.blocked.length > 0 ||
    relations.blocking.length > 0 ||
    relations.related.length > 0
  );

  return (
    <div>
        {!hasAnyRelations ? (
          <div className="text-center py-6">
            <LinkIcon className="h-10 w-10 mx-auto mb-3 text-[#333]" />
            <p className="text-[#ccc] text-sm mb-1">No relations</p>
            <p className="text-[#666] text-xs">This issue doesn't have any relations yet</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Parent Issue */}
            {relations.parent && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <h4 className="text-xs font-medium text-[#ccc] uppercase tracking-wide">Parent Issue</h4>
                </div>
                <RelationItem
                  item={relations.parent}
                  workspaceId={workspaceId}
                  onRemove={() => handleRemoveRelation(relations.parent!.id, 'parent')}
                  canRemove={true}
                />
              </div>
            )}

            {/* Sub-issues */}
            {relations.children.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <h4 className="text-xs font-medium text-[#ccc] uppercase tracking-wide">
                    Sub-issues
                  </h4>
                  <Badge className="bg-[#333] text-[#ccc] text-xs px-1.5 py-0.5">
                    {relations.children.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {relations.children.map((child) => (
                    <RelationItem
                      key={child.id}
                      item={child}
                      workspaceId={workspaceId}
                      onRemove={() => handleRemoveRelation(child.id, 'child')}
                      canRemove={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Blocked by */}
            {relations.blocked.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <h4 className="text-xs font-medium text-[#ccc] uppercase tracking-wide">
                    Blocked by
                  </h4>
                  <Badge className="bg-[#333] text-[#ccc] text-xs px-1.5 py-0.5">
                    {relations.blocked.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {relations.blocked.map((item) => (
                    <RelationItem
                      key={item.id}
                      item={item}
                      workspaceId={workspaceId}
                      onRemove={() => handleRemoveRelation(item.id, 'blocked')}
                      canRemove={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Blocking */}
            {relations.blocking.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <h4 className="text-xs font-medium text-[#ccc] uppercase tracking-wide">
                    Blocking
                  </h4>
                  <Badge className="bg-[#333] text-[#ccc] text-xs px-1.5 py-0.5">
                    {relations.blocking.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {relations.blocking.map((item) => (
                    <RelationItem
                      key={item.id}
                      item={item}
                      workspaceId={workspaceId}
                      onRemove={() => handleRemoveRelation(item.id, 'blocking')}
                      canRemove={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Related */}
            {relations.related.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <h4 className="text-xs font-medium text-[#ccc] uppercase tracking-wide">
                    Related
                  </h4>
                  <Badge className="bg-[#333] text-[#ccc] text-xs px-1.5 py-0.5">
                    {relations.related.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {relations.related.map((item) => (
                    <RelationItem
                      key={item.id}
                      item={item}
                      workspaceId={workspaceId}
                      onRemove={() => handleRemoveRelation(item.id, 'related')}
                      canRemove={true}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
      {/* Add relation button */}
      <div className="flex justify-end mt-6 pt-4 border-t border-[#1f1f1f]">
        <Button 
          variant="outline" 
          size="sm" 
          className="border-[#333] hover:bg-[#1a1a1a] hover:border-[#444] text-[#ccc]"
          onClick={() => {
            // TODO: Implement add relation modal
            toast({
              title: "Coming Soon",
              description: "Add relations feature is coming soon",
            });
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Relation
        </Button>
      </div>
    </div>
  );
}
