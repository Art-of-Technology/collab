"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Trash2
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
import PageHeader, { pageHeaderButtonStyles, pageHeaderSearchStyles } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ConfirmationModal } from '@/components/modals/ConfirmationModal';
import { useProjects } from '@/hooks/queries/useProjects';

interface ViewsPageClientProps {
  workspaceId: string;
}

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
    default: return 'text-gray-500';
  }
};

const getFavoriteButtonClassName = (isFavorite: boolean) => {
  return cn(
    "h-5 w-5 p-0 transition-colors hover:bg-transparent",
    isFavorite
      ? "text-yellow-400 opacity-100"
      : "text-gray-500 hover:text-yellow-400 opacity-0 group-hover:opacity-100"
  );
};

export default function ViewsPageClient({ workspaceId }: ViewsPageClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const filteredViews = views.filter(view =>
    view.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (view.description && view.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const favoriteViews = filteredViews.filter(view => view.isFavorite);
  const workspaceViews = filteredViews.filter(view => view.visibility === 'WORKSPACE' && !view.isFavorite);
  const personalViews = filteredViews.filter(view => view.visibility === 'PERSONAL' && !view.isFavorite);
  const sharedViews = filteredViews.filter(view => view.visibility === 'SHARED' && !view.isFavorite);

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
      toast({
        title: "Success",
        description: "View favorite status updated",
      });
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

  const ViewRow = ({ view }: { view: any }) => {
    const TypeIcon = viewTypeIcons[view.displayType as keyof typeof viewTypeIcons];
    const VisibilityIcon = getVisibilityIcon(view.visibility);

    return (
      <div
        className={cn(
          "group relative cursor-pointer transition-all duration-150",
          // Mobile: Compact card design
          "mx-3 mb-2 p-3 rounded-lg",
          "bg-white/5 hover:bg-white/5 backdrop-blur-sm",
          "border border-white/5 hover:border-white/20",
          // Desktop: Minimal list row
          "md:mx-0 md:mb-0 md:py-2.5 md:px-4 md:rounded-none md:border-0",
          "md:bg-transparent md:hover:bg-white/5 md:backdrop-blur-none"
        )}
        onClick={() => handleViewClick(view.slug || view.id)}
      >
        {/* Mobile Layout */}
        <div className="md:hidden">
          <div className="flex items-start justify-between mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Favorite Star for Mobile */}
              <button
                className={cn(
                  "p-0.5 rounded transition-colors flex-shrink-0",
                  view.isFavorite ? "text-yellow-400" : "text-gray-500 hover:text-yellow-400"
                )}
                onClick={(e) => handleToggleViewFavorite(view.id, e)}
                disabled={toggleViewFavoriteMutation.isPending}
                title={view.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Star className={cn("h-3.5 w-3.5", view.isFavorite && "fill-current")} />
              </button>

              {/* View Type Icon */}
              <TypeIcon className="h-4 w-4 text-gray-500 shrink-0" />

              {/* View Name */}
              <span className="text-gray-100 text-sm font-medium truncate">
                {view.name}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
              <button
                className="p-1.5 rounded-md hover:bg-gray-800 transition-colors"
                onClick={(e) => handleViewSettings(view.slug || view.id, e)}
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5 text-gray-500" />
              </button>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "p-1.5 rounded-md transition-colors",
                        view.isDefault
                          ? "cursor-not-allowed opacity-30"
                          : "hover:bg-red-500/10 text-red-400 hover:text-red-300"
                      )}
                      onClick={(e) => !view.isDefault && handleDeleteView(view.id, view.name, e)}
                      disabled={view.isDefault}
                      title={view.isDefault ? "Default views cannot be deleted" : "Delete view"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  {view.isDefault && (
                    <TooltipContent className="bg-gray-800 border-white/5 text-gray-100 text-xs">
                      <p>Default views cannot be deleted</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Description */}
          {view.description && (
            <p className="text-gray-500 text-xs mb-2.5 line-clamp-2 leading-relaxed">
              {view.description}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* View Type */}
              <span className="text-gray-500">
                {viewTypeLabels[view.displayType as keyof typeof viewTypeLabels]}
              </span>

              {/* Visibility */}
              <div className="flex items-center gap-1.5">
                <VisibilityIcon className={cn("h-3 w-3", getVisibilityColor(view.visibility))} />
                <span className={cn("text-xs", getVisibilityColor(view.visibility))}>
                  {view.visibility === 'WORKSPACE' ? 'Team' :
                    view.visibility === 'PERSONAL' ? 'Personal' : 'Shared'}
                </span>
              </div>
            </div>

            {/* Updated Date */}
            <span className="text-gray-600 text-xs">
              {new Date(view.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              })}
            </span>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex md:items-center md:relative md:gap-3">
          {/* Favorite Star */}
          <div className="flex items-center w-5">
            <Button
              variant="ghost"
              size="sm"
              className={getFavoriteButtonClassName(view.isFavorite)}
              onClick={(e) => handleToggleViewFavorite(view.id, e)}
              disabled={toggleViewFavoriteMutation.isPending}
              title={view.isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={cn("h-3 w-3", view.isFavorite && "fill-current")} />
            </Button>
          </div>

          {/* View Type Icon */}
          <div className="flex items-center w-5">
            <TypeIcon className="h-4 w-4 text-gray-500" />
          </div>

          {/* View Name & Description */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-100 text-sm font-medium truncate">
                {view.name}
              </span>
              {view.description && (
                <span className="text-gray-500 text-xs truncate">
                  {view.description}
                </span>
              )}
            </div>
          </div>

          {/* View Type Label */}
          <div className="w-20 text-gray-500 text-xs">
            {viewTypeLabels[view.displayType as keyof typeof viewTypeLabels]}
          </div>

          {/* Visibility */}
          <div className="w-24 flex items-center gap-1.5">
            <VisibilityIcon className={cn("h-3.5 w-3.5", getVisibilityColor(view.visibility))} />
            <span className={cn("text-xs", getVisibilityColor(view.visibility))}>
              {view.visibility === 'WORKSPACE' ? 'Team' :
                view.visibility === 'PERSONAL' ? 'Personal' : 'Shared'}
            </span>
          </div>

          {/* Issue Count */}
          <div className="w-16 text-gray-500 text-xs text-right tabular-nums">
            {view._count?.issues !== undefined ? view._count.issues : '—'}
          </div>

          {/* Last Updated */}
          <div className="w-20 text-gray-600 text-xs text-right">
            {new Date(view.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7 transition-colors",
                        view.isDefault
                          ? "text-gray-600 cursor-not-allowed opacity-30"
                          : "text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                      )}
                      onClick={(e) => !view.isDefault && handleDeleteView(view.id, view.name, e)}
                      disabled={view.isDefault}
                      title={view.isDefault ? "Default views cannot be deleted" : "Delete view"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TooltipTrigger>
                {view.isDefault && (
                  <TooltipContent className="bg-gray-800 border-gray-700 text-gray-100 text-xs">
                    <p>Default views cannot be deleted</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    );
  };

  const ViewSection = ({ title, views, count }: {
    title: string;
    views: any[];
    count: number;
  }) => {
    if (views.length === 0) return null;

    return (
      <div className="mb-4">
        {/* Section Header - Mobile & Desktop */}
        <div className={cn(
          "flex items-center sticky top-0 z-10",
          // Mobile: Glassmorphism header
          "px-4 py-2.5 mb-2 backdrop-blur-xl bg-black/60 border-b border-white/5",
          // Desktop: Clean minimal header  
          "md:px-4 md:py-2 md:mb-0 md:backdrop-blur-none md:bg-[#101011] md:border-b md:border-b-white/5"
        )}>
          <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">
            {title}
          </span>
          <span className="ml-2 text-gray-600 text-xs tabular-nums">
            {count}
          </span>
        </div>

        {/* Views */}
        <div className="md:divide-y md:divide-white/5">
          {views.map((view) => (
            <ViewRow key={view.id} view={view} />
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full bg-[#101011] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0969da]"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header */}
      <PageHeader
        icon={Eye}
        title="Views"
        subtitle={`${filteredViews.length} ${filteredViews.length === 1 ? 'view' : 'views'}`}
        search={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
            <Input
              placeholder="Search views..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(pageHeaderSearchStyles, "w-full md:w-64")}
            />
          </div>
        }
        actions={
          <Button
            onClick={handleCreateView}
            className={pageHeaderButtonStyles.primary}
          >
            <Plus className="h-3.5 w-3.5 md:mr-1.5" />
            <span data-text className="hidden md:inline ml-1">New view</span>
          </Button>
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {filteredViews.length > 0 ? (
          <div className="pb-16 md:pb-12">
            {favoriteViews.length > 0 && (
              <ViewSection
                title="Favorites"
                views={favoriteViews}
                count={favoriteViews.length}
              />
            )}

            {workspaceViews.length > 0 && (
              <ViewSection
                title="Team views"
                views={workspaceViews}
                count={workspaceViews.length}
              />
            )}

            {personalViews.length > 0 && (
              <ViewSection
                title="Your views"
                views={personalViews}
                count={personalViews.length}
              />
            )}

            {sharedViews.length > 0 && (
              <ViewSection
                title="Shared with you"
                views={sharedViews}
                count={sharedViews.length}
              />
            )}
          </div>
        ) : searchQuery ? (
          <div className="h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mx-auto mb-3">
                <Search className="h-5 w-5 text-gray-600" />
              </div>
              <p className="text-gray-400 text-sm font-medium">No views found</p>
              <p className="text-gray-600 text-xs mt-1">
                Try adjusting your search terms
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center px-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-lg bg-gray-900/50 flex items-center justify-center mx-auto mb-3">
                <Eye className="h-5 w-5 text-gray-600" />
              </div>
              <p className="text-gray-400 text-sm font-medium">No views yet</p>
              <p className="text-gray-600 text-xs mt-1.5 mb-4">
                Create custom views to organize your work
              </p>
              <Button
                onClick={handleCreateView}
                size="sm"
                className="bg-[#0969da] hover:bg-[#0860ca] text-white text-xs h-8 px-3"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Create your first view
              </Button>
            </div>
          </div>
        )}
      </div>

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
          <span className="text-gray-400 text-sm">
            Are you sure you want to delete <strong className="text-gray-100">&quot;{viewToDelete?.name}&quot;</strong> ? <br />This action cannot be undone.
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