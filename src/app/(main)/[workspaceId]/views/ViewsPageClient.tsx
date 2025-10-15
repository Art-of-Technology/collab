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
import PageHeader, { pageHeaderButtonStyles } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ViewsPageClientProps {
  workspaceId: string;
}

const viewTypeIcons = {
  KANBAN: Grid,
  LIST: List,
  TABLE: Table,
  CALENDAR: Calendar,
  TIMELINE: BarChart3
};

const viewTypeLabels = {
  KANBAN: 'Board',
  LIST: 'List',
  TABLE: 'Table',
  CALENDAR: 'Calendar',
  TIMELINE: 'Timeline'
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
    default: return 'text-[#6b7280]';
  }
};

export default function ViewsPageClient({ workspaceId }: ViewsPageClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: views = [], isLoading } = useViews({
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
      await toggleViewFavoriteMutation.mutateAsync(viewId);
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

  const handleDeleteView = async (viewId: string, viewName: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${viewName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteViewMutation.mutateAsync({
        workspaceId,
        viewId
      });

      toast({
        title: 'Success',
        description: 'View deleted successfully'
      });
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
          "group relative cursor-pointer transition-all duration-200",
          // Mobile-first: Card-like design with glassmorphism
          "mx-3 mb-3 p-4 rounded-xl",
          "bg-white/5 hover:bg-white/10 backdrop-blur-sm",
          "border border-white/10 hover:border-white/20",
          // Desktop: More compact list style
          "md:mx-0 md:mb-0 md:p-3 md:rounded-lg md:border-0",
          "md:bg-transparent md:hover:bg-[#0f1011] md:backdrop-blur-none"
        )}
        onClick={() => handleViewClick(view.slug || view.id)}
      >
        {/* Mobile Layout */}
        <div className="md:hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Favorite Star */}
              {view.isFavorite && (
                <Star className="h-4 w-4 text-yellow-500 fill-current shrink-0" />
              )}

              {/* View Type Icon */}
              <TypeIcon className="h-4 w-4 text-gray-400 shrink-0" />

              {/* View Name */}
              <span className="text-white text-sm font-medium truncate">
                {view.name}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                onClick={(e) => handleViewSettings(view.slug || view.id, e)}
                title="Settings"
              >
                <Settings className="h-4 w-4 text-gray-400" />
              </button>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        view.isDefault
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-red-500/10 text-red-400"
                      )}
                      onClick={(e) => !view.isDefault && handleDeleteView(view.id, view.name, e)}
                      disabled={view.isDefault}
                      title={view.isDefault ? "Default views cannot be deleted" : "Delete view"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  {view.isDefault && (
                    <TooltipContent className="bg-gray-900 border-gray-700 text-white">
                      <p>Default views cannot be deleted</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Description */}
          {view.description && (
            <p className="text-gray-500 text-xs mb-2 line-clamp-2">
              {view.description}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* View Type */}
              <span className="text-gray-400">
                {viewTypeLabels[view.displayType as keyof typeof viewTypeLabels]}
              </span>

              {/* Visibility */}
              <div className="flex items-center gap-1">
                <VisibilityIcon className={cn("h-3 w-3", getVisibilityColor(view.visibility))} />
                <span className={cn("", getVisibilityColor(view.visibility))}>
                  {view.visibility === 'WORKSPACE' ? 'Team' :
                    view.visibility === 'PERSONAL' ? 'Personal' : 'Shared'}
                </span>
              </div>

              {/* Favorite Star for Mobile */}
              <button
                className={cn(
                  "p-1 rounded transition-colors",
                  view.isFavorite ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"
                )}
                onClick={(e) => handleToggleViewFavorite(view.id, e)}
                disabled={toggleViewFavoriteMutation.isPending}
                title={view.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Star className={cn("h-3 w-3", view.isFavorite && "fill-current")} />
              </button>
            </div>

            {/* Updated Date */}
            <span className="text-gray-500">
              {new Date(view.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              })}
            </span>
          </div>
        </div>

        {/* Desktop Layout - Original structure */}
        <div className="hidden md:flex md:items-center md:relative">

          {/* View Type Icon */}
          <div className="flex items-center w-6 mr-3">
            <TypeIcon className="h-4 w-4 text-gray-400" />
          </div>

          {/* View Name & Description */}
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex flex-col">
              <span className="text-white text-sm font-medium truncate">
                {view.name}
              </span>
              {view.description && (
                <span className="text-gray-500 text-xs truncate mt-0.5">
                  {view.description}
                </span>
              )}
            </div>
          </div>

          {/* View Type Label */}
          <div className="w-20 mr-4 text-gray-400 text-sm">
            {viewTypeLabels[view.displayType as keyof typeof viewTypeLabels]}
          </div>

          {/* Visibility */}
          <div className="w-24 mr-4 flex items-center">
            <VisibilityIcon className={cn("h-4 w-4 mr-1", getVisibilityColor(view.visibility))} />
            <span className={cn("text-sm", getVisibilityColor(view.visibility))}>
              {view.visibility === 'WORKSPACE' ? 'Team' :
                view.visibility === 'PERSONAL' ? 'Personal' : 'Shared'}
            </span>
          </div>

          {/* Issue Count */}
          <div className="w-16 mr-4 text-gray-500 text-sm text-right">
            {view._count?.issues !== undefined ? `${view._count.issues}` : '—'}
          </div>

          {/* Last Updated */}
          <div className="w-20 mr-4 text-gray-500 text-xs text-right">
            {new Date(view.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric'
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0 transition-opacity">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 transition-colors",
                        view.isDefault
                          ? "text-gray-600 cursor-not-allowed opacity-40"
                          : "text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
                  <TooltipContent className="bg-gray-900 border-gray-700 text-white">
                    <p>Default views cannot be deleted</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            {/* Favorite Star - Interactive */}
            <div className="flex items-center w-6">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-5 w-5 p-0 transition-opacity hover:bg-transparent",
                  view.isFavorite ? "text-yellow-500 opacity-70 group-hover:text-yellow-500" : "text-gray-400 hover:text-yellow-500 opacity-70 group-hover:opacity-100"
                )}
                onClick={(e) => handleToggleViewFavorite(view.id, e)}
                disabled={toggleViewFavoriteMutation.isPending}
                title={view.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Star className={cn("h-3 w-3", view.isFavorite && "fill-current")} />
              </Button>
            </div>
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
      <div className="mb-6">
        {/* Section Header - Mobile & Desktop */}
        <div className={cn(
          "flex items-center sticky top-0 z-10",
          // Mobile: Glassmorphism header with padding
          "px-4 py-3 mb-3 backdrop-blur-xl bg-black/60 border-b border-white/10",
          // Desktop: Clean minimal header  
          "md:px-6 md:py-2 md:mb-0 md:backdrop-blur-none md:bg-[#101011] md:border-b-[#1a1a1a]"
        )}>
          <span className="text-gray-400 text-sm font-medium">
            {title}
          </span>
          <span className="ml-2 text-gray-500 text-sm">
            {count}
          </span>
        </div>

        {/* Views */}
        <div className="md:divide-y md:divide-[#1a1a1a]">
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
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search views..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full md:w-64 bg-white/5 md:bg-[#1a1a1a] backdrop-blur-sm border-white/10 md:border-[#2a2a2a] text-white placeholder-gray-500 focus:border-white/30 md:focus:border-[#0969da] h-7 md:h-8 text-xs md:text-sm rounded-lg transition-all duration-200"
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
          <div className="pb-20 md:pb-16">
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
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
                <Search className="h-6 w-6 text-[#666]" />
              </div>
              <p className="text-[#9ca3af] text-sm">No views found</p>
              <p className="text-[#666] text-xs mt-1">
                Try adjusting your search terms
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
                <Eye className="h-6 w-6 text-[#666]" />
              </div>
              <p className="text-[#9ca3af] text-sm">No views yet</p>
              <p className="text-[#666] text-xs mt-1 mb-4">
                Create custom views to organize your work
              </p>
              <Button
                onClick={handleCreateView}
                size="sm"
                className="bg-[#0969da] hover:bg-[#0860ca] text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
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
        />
      )}
    </div>
  );
} 