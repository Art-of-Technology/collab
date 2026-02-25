"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
import { PageLayout } from '@/components/ui/page-layout';
import { PageHeader } from '@/components/ui/page-header';
import { SearchBar } from '@/components/ui/search-bar';
import { FilterToggle } from '@/components/ui/filter-toggle';
import { ShadowListGroup } from '@/components/ui/shadow-list-group';
import { EmptyState } from '@/components/ui/empty-state';

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
    case 'WORKSPACE': return 'text-green-500';
    case 'PERSONAL': return 'text-blue-500';
    case 'SHARED': return 'text-violet-500';
    default: return 'text-collab-500';
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

  const viewCounts = {
    all: views.length,
    workspace: views.filter(v => v.visibility === 'WORKSPACE').length,
    personal: views.filter(v => v.visibility === 'PERSONAL').length,
    shared: views.filter(v => v.visibility === 'SHARED').length,
  };

  const filterOptions = [
    { id: 'all', label: 'All', count: viewCounts.all },
    { id: 'workspace', label: 'Workspace', count: viewCounts.workspace },
    { id: 'personal', label: 'Personal', count: viewCounts.personal },
    { id: 'shared', label: 'Shared', count: viewCounts.shared },
  ];

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
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-collab-500" />
      </div>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Views"
        subtitle={`${filteredViews.length} view${filteredViews.length !== 1 ? 's' : ''}`}
        actions={
          <Button
            onClick={handleCreateView}
            size="sm"
            className="h-9 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
          >
            <Plus className="h-4 w-4 mr-2" />
            New View
          </Button>
        }
      >
        <div className="flex items-center gap-3">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search views..."
          />
          <FilterToggle
            options={filterOptions}
            value={visibilityFilter}
            onChange={(id) => setVisibilityFilter(id as ViewVisibilityFilter)}
          />
        </div>
      </PageHeader>

      {filteredViews.length > 0 ? (
        <ShadowListGroup>
          {filteredViews.map((view) => (
            <ShadowListGroup.Item key={view.id} className="!p-0">
              <ViewListItem
                view={view}
                onViewClick={() => handleViewClick(view.slug || view.id)}
                onSettings={(e) => handleViewSettings(view.slug || view.id, e)}
                onToggleFavorite={(e) => handleToggleViewFavorite(view.id, e)}
                onDelete={(e) => handleDeleteView(view.id, view.name, e)}
                isFavoriteLoading={toggleViewFavoriteMutation.isPending}
              />
            </ShadowListGroup.Item>
          ))}
        </ShadowListGroup>
      ) : searchQuery ? (
        <EmptyState
          icon={<Search className="h-8 w-8 text-collab-500/60" />}
          title="No views found"
          description="Try different keywords"
          action={
            <Button
              onClick={() => setSearchQuery('')}
              variant="ghost"
              size="sm"
              className="text-collab-400 hover:text-collab-50 hover:bg-collab-700"
            >
              Clear search
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<Eye className="h-8 w-8 text-collab-500/60" />}
          title="No views yet"
          description="Views help you organize and filter your issues. Create custom views for different workflows and perspectives."
          action={
            <Button
              onClick={handleCreateView}
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create your first view
            </Button>
          }
        />
      )}

      {showCreateModal && (
        <CreateViewModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          workspaceId={workspaceId}
          projects={projects}
        />
      )}

      <ConfirmationModal
        isOpen={!!viewToDelete}
        onClose={() => setViewToDelete(null)}
        onConfirm={confirmDeleteView}
        title="Delete View"
        message={
          <span className="text-collab-400 text-sm">
            Are you sure you want to delete <strong className="text-collab-50">&quot;{viewToDelete?.name}&quot;</strong>? <br />This action cannot be undone.
          </span>
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleteViewMutation.isPending}
      />
    </PageLayout>
  );
}

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
      className="group relative flex items-center gap-4 px-5 py-4 hover:bg-collab-700/50 transition-all duration-200 cursor-pointer"
      onClick={onViewClick}
    >
      <div
        className={cn(
          "w-1 h-8 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity",
          view.visibility === 'WORKSPACE' ? "bg-green-500" :
          view.visibility === 'PERSONAL' ? "bg-blue-500" :
          view.visibility === 'SHARED' ? "bg-violet-500" :
          "bg-indigo-500"
        )}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-medium text-collab-50 group-hover:text-white truncate">
            {view.name}
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-collab-700 text-collab-500 font-mono flex items-center gap-1">
            <TypeIcon className="h-3 w-3" />
            {viewTypeLabels[view.displayType as keyof typeof viewTypeLabels]}
          </span>
          {view.isDefault && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-collab-600 text-collab-400 uppercase tracking-wider font-medium">
              default
            </span>
          )}
        </div>

        {view.description && (
          <p className="text-xs text-collab-500/60 truncate max-w-[280px] mt-0.5">
            {view.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-[11px] text-collab-500">
            <VisibilityIcon className={cn("h-3 w-3", getVisibilityColor(view.visibility))} />
            <span className={getVisibilityColor(view.visibility)}>
              {view.visibility === 'WORKSPACE' ? 'Team' :
               view.visibility === 'PERSONAL' ? 'Personal' : 'Shared'}
            </span>
          </div>

          {view._count?.issues !== undefined && (
            <div className="flex items-center gap-1 text-[11px] text-collab-500">
              <Eye className="h-3 w-3 text-collab-500" />
              <span className="tabular-nums">{view._count.issues} issues</span>
            </div>
          )}

          <span className="text-[10px] text-collab-500/50">
            {formatDistanceToNow(new Date(view.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

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
              : "text-collab-500 hover:text-yellow-400"
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

        <div className="w-px h-5 bg-collab-600 mx-1" />

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onSettings}
          className="h-8 w-8 text-collab-500 hover:text-white"
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
                    ? "text-collab-500/50 cursor-not-allowed"
                    : "text-collab-500 hover:text-red-500"
                )}
                title={view.isDefault ? "Default views cannot be deleted" : "Delete"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            {view.isDefault && (
              <TooltipContent className="bg-collab-700 border-collab-600 text-collab-50 text-xs">
                <p>Default views cannot be deleted</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
