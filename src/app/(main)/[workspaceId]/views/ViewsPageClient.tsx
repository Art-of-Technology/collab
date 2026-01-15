"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Plus,
  Eye,
  Star,
  Grid,
  List,
  Table,
  Calendar,
  BarChart3,
  Users,
  User,
  Share,
  Settings,
  Trash2,
  Loader2
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useViews, useDeleteView } from '@/hooks/queries/useViews';
import { useToggleViewFavorite } from '@/hooks/queries/useViewFavorites';
import { useWorkspace } from '@/context/WorkspaceContext';
import CreateViewModal from '@/components/modals/CreateViewModal';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { useProjects } from '@/hooks/queries/useProjects';
import { formatDistanceToNow } from 'date-fns';

interface ViewsPageClientProps {
  workspaceId: string;
}

type ViewVisibilityFilter = 'all' | 'workspace' | 'personal' | 'shared';

const viewTypeIcons = {
  KANBAN: Grid,
  LIST: List,
  TABLE: Table,
  CALENDAR: Calendar,
  TIMELINE: BarChart3,
  PLANNING: Calendar
};

const viewTypeLabels = {
  KANBAN: 'Board',
  LIST: 'List',
  TABLE: 'Table',
  CALENDAR: 'Calendar',
  TIMELINE: 'Timeline',
  PLANNING: 'Planning'
};

const getVisibilityIcon = (visibility: string) => {
  switch (visibility) {
    case 'WORKSPACE': return Users;
    case 'PERSONAL': return User;
    case 'SHARED': return Share;
    default: return User;
  }
};

const getVisibilityColor = (visibility: string) => {
  switch (visibility) {
    case 'WORKSPACE': return 'text-[#22c55e]';
    case 'PERSONAL': return 'text-[#3b82f6]';
    case 'SHARED': return 'text-[#a855f7]';
    default: return 'text-[#6e7681]';
  }
};

export default function ViewsPageClient({ workspaceId }: ViewsPageClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<ViewVisibilityFilter>('all');
  const [viewToDelete, setViewToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: views = [], isLoading } = useViews({
    workspaceId,
    includeStats: true
  });

  const { data: projects = [] } = useProjects({
    workspaceId,
    includeStats: true
  });

  const deleteViewMutation = useDeleteView();
  const toggleViewFavoriteMutation = useToggleViewFavorite();

  const filteredViews = views.filter(view => {
    const matchesSearch = view.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (view.description && view.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesFilter = visibilityFilter === 'all' ||
      (visibilityFilter === 'workspace' && view.visibility === 'WORKSPACE') ||
      (visibilityFilter === 'personal' && view.visibility === 'PERSONAL') ||
      (visibilityFilter === 'shared' && view.visibility === 'SHARED');

    return matchesSearch && matchesFilter;
  });

  // Calculate view counts
  const viewCounts = {
    all: views.length,
    workspace: views.filter(v => v.visibility === 'WORKSPACE').length,
    personal: views.filter(v => v.visibility === 'PERSONAL').length,
    shared: views.filter(v => v.visibility === 'SHARED').length,
  };

  const handleViewClick = (viewSlug: string) => {
    router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/views/${viewSlug}`);
  };

  const handleCreateView = () => {
    setShowCreateModal(true);
  };

  const handleViewSettings = (viewSlug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/views/${viewSlug}/settings`);
  };

  const handleToggleViewFavorite = async (viewId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await toggleViewFavoriteMutation.mutateAsync({ workspaceId, viewId });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update view favorite status",
        variant: "destructive",
      });
    }
  };

  const handleDeleteView = (viewId: string, viewName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setViewToDelete({ id: viewId, name: viewName });
  };

  const confirmDeleteView = async () => {
    if (!viewToDelete) return;

    try {
      await deleteViewMutation.mutateAsync({
        workspaceId,
        viewId: viewToDelete.id
      });

      toast({
        title: 'Success',
        description: 'View deleted successfully'
      });
      setViewToDelete(null);
    } catch (error) {
      console.error('Error deleting view:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete view',
        variant: 'destructive'
      });
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0b]">
        <Loader2 className="h-6 w-6 animate-spin text-[#6e7681]" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0b]">
      {/* Header */}
      <div className="flex-none border-b border-[#1f1f1f]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
              <Eye className="h-4 w-4 text-[#a371f7]" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-[#e6edf3]">Views</h1>
              <p className="text-xs text-[#6e7681]">
                {filteredViews.length} view{filteredViews.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCreateView}
              size="sm"
              className="h-7 px-3 bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/20 hover:border-[#3b82f6]/30"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New View
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 pb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6e7681]" />
            <Input
              placeholder="Search views..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#6e7681] focus:border-[#30363d]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#1f1f1f] p-0.5 bg-[#0d0d0e]">
            {(['all', 'workspace', 'personal', 'shared'] as const).map((filter) => (
              <Button
                key={filter}
                variant="ghost"
                size="sm"
                onClick={() => setVisibilityFilter(filter)}
                className={cn(
                  "h-7",
                  visibilityFilter === filter
                    ? "bg-[#1f1f1f] text-[#e6edf3]"
                    : "text-[#6e7681] hover:text-[#8b949e] hover:bg-transparent"
                )}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                <span className="ml-1.5 text-[#6e7681]">
                  {viewCounts[filter]}
                </span>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {filteredViews.length > 0 ? (
            <div className="rounded-lg border border-[#1f1f1f] overflow-hidden divide-y divide-[#1f1f1f]">
              {filteredViews.map((view) => (
                <ViewListItem
                  key={view.id}
                  view={view}
                  onViewClick={() => handleViewClick(view.slug || view.id)}
                  onSettings={(e) => handleViewSettings(view.slug || view.id, e)}
                  onToggleFavorite={(e) => handleToggleViewFavorite(view.id, e)}
                  onDelete={(e) => handleDeleteView(view.id, view.name, e)}
                  isFavoriteLoading={toggleViewFavoriteMutation.isPending}
                />
              ))}
            </div>
          ) : searchQuery ? (
            <EmptySearch onClear={() => setSearchQuery('')} />
          ) : (
            <EmptyState onCreate={handleCreateView} />
          )}
        </div>
      </ScrollArea>

      {/* Create View Modal */}
      {showCreateModal && (
        <CreateViewModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          workspaceId={workspaceId}
          projects={projects}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!viewToDelete}
        onClose={() => setViewToDelete(null)}
        onConfirm={confirmDeleteView}
        title="Delete View"
        message={
          <span className="text-[#8b949e] text-sm">
            Are you sure you want to delete <strong className="text-[#e6edf3]">&quot;{viewToDelete?.name}&quot;</strong>? <br />This action cannot be undone.
          </span>
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleteViewMutation.isPending}
      />
    </div>
  );
}

// View List Item Component
function ViewListItem({
  view,
  onViewClick,
  onSettings,
  onToggleFavorite,
  onDelete,
  isFavoriteLoading
}: {
  view: any;
  onViewClick: () => void;
  onSettings: (e: React.MouseEvent) => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isFavoriteLoading: boolean;
}) {
  const TypeIcon = viewTypeIcons[view.displayType as keyof typeof viewTypeIcons] || Grid;
  const VisibilityIcon = getVisibilityIcon(view.visibility);

  return (
    <div
      className="group relative flex items-center gap-4 px-5 py-4 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200 cursor-pointer"
      onClick={onViewClick}
    >
      {/* Color indicator - using visibility color */}
      <div
        className={cn(
          "w-1 h-8 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity",
          view.visibility === 'WORKSPACE' ? "bg-[#22c55e]" :
          view.visibility === 'PERSONAL' ? "bg-[#3b82f6]" :
          view.visibility === 'SHARED' ? "bg-[#a855f7]" :
          "bg-[#6366f1]"
        )}
      />

      {/* View Info */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2.5">
          <h3 className="text-[14px] font-semibold text-[#fafafa] group-hover:text-white truncate">
            {view.name}
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f23] text-[#71717a] font-mono flex items-center gap-1">
            <TypeIcon className="h-3 w-3" />
            {viewTypeLabels[view.displayType as keyof typeof viewTypeLabels]}
          </span>
          {view.isDefault && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#27272a] text-[#a1a1aa] uppercase tracking-wider font-medium">
              default
            </span>
          )}
        </div>

        {/* Description */}
        {view.description && (
          <p className="text-[12px] text-[#52525b] truncate max-w-[280px] mt-0.5">
            {view.description}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
            <VisibilityIcon className={cn("h-3 w-3", getVisibilityColor(view.visibility))} />
            <span className={getVisibilityColor(view.visibility)}>
              {view.visibility === 'WORKSPACE' ? 'Team' :
               view.visibility === 'PERSONAL' ? 'Personal' : 'Shared'}
            </span>
          </div>

          {view._count?.issues !== undefined && (
            <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
              <Eye className="h-3 w-3 text-[#6e7681]" />
              <span className="tabular-nums">{view._count.issues} issues</span>
            </div>
          )}

          <span className="text-[10px] text-[#3f3f46]">
            {formatDistanceToNow(new Date(view.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Inline Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(e);
          }}
          disabled={isFavoriteLoading}
          className={cn(
            "h-8 w-8",
            view.isFavorite
              ? "text-yellow-400 hover:text-yellow-300"
              : "text-[#71717a] hover:text-yellow-400"
          )}
          title={view.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("h-4 w-4", view.isFavorite && "fill-current")} />
        </Button>

        <Button
          variant="ghost"
          size="md"
          onClick={(e) => {
            e.stopPropagation();
            onViewClick();
          }}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Open</span>
        </Button>

        <div className="w-px h-5 bg-[#27272a] mx-1" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onSettings}
          className="h-8 w-8 text-[#71717a] hover:text-white"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                disabled={view.isDefault}
                className={cn(
                  "h-8 w-8",
                  view.isDefault
                    ? "text-[#3f3f46] cursor-not-allowed"
                    : "text-[#71717a] hover:text-[#ef4444]"
                )}
                title={view.isDefault ? "Default views cannot be deleted" : "Delete"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            {view.isDefault && (
              <TooltipContent className="bg-[#1f1f1f] border-[#27272a] text-[#e6edf3] text-xs">
                <p>Default views cannot be deleted</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

// Empty Search State
function EmptySearch({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-12 h-12 rounded-full bg-[#161617] flex items-center justify-center mb-4">
        <Search className="h-6 w-6 text-[#6e7681]" />
      </div>
      <h3 className="text-sm font-medium text-[#e6edf3] mb-1">No views found</h3>
      <p className="text-xs text-[#6e7681] mb-4">Try different keywords</p>
      <Button
        onClick={onClear}
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617]"
      >
        Clear search
      </Button>
    </div>
  );
}

// Empty State
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-full bg-[#161617] flex items-center justify-center mb-4">
        <Eye className="h-8 w-8 text-[#6e7681]" />
      </div>
      <h3 className="text-sm font-medium text-[#e6edf3] mb-1">No views yet</h3>
      <p className="text-xs text-[#6e7681] mb-4 text-center max-w-sm">
        Views help you organize and filter your issues.
        Create custom views for different workflows and perspectives.
      </p>
      <Button
        onClick={onCreate}
        size="sm"
        className="h-7 px-3 bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/20 hover:border-[#3b82f6]/30"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Create your first view
      </Button>
    </div>
  );
}
