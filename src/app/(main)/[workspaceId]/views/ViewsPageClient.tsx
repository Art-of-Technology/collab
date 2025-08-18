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
  MoreHorizontal,
  Users,
  User,
  Share
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useViews } from '@/hooks/queries/useViews';
import { useWorkspace } from '@/context/WorkspaceContext';
import CreateViewModal from '@/components/modals/CreateViewModal';
import { cn } from '@/lib/utils';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: views = [], isLoading } = useViews({
    workspaceId,
    includeStats: true
  });

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

  const ViewRow = ({ view }: { view: any }) => {
    const TypeIcon = viewTypeIcons[view.displayType as keyof typeof viewTypeIcons];
    const VisibilityIcon = getVisibilityIcon(view.visibility);
    
    return (
      <div 
        className="group flex items-center px-6 py-3 hover:bg-[#0f1011] cursor-pointer transition-colors"
        onClick={() => handleViewClick(view.slug || view.id)}
      >
        {/* Favorite Star */}
        <div className="flex items-center w-6 mr-3">
          {view.isFavorite ? (
            <Star className="h-4 w-4 text-yellow-500 fill-current" />
          ) : (
            <div className="w-4 h-4" />
          )}
        </div>

        {/* View Type Icon */}
        <div className="flex items-center w-6 mr-3">
          <TypeIcon className="h-4 w-4 text-[#9ca3af]" />
        </div>

        {/* View Name & Description */}
        <div className="flex-1 min-w-0 mr-4">
          <div className="flex flex-col">
            <span className="text-white text-sm font-medium truncate">
              {view.name}
            </span>
            {view.description && (
              <span className="text-[#666] text-xs truncate mt-0.5">
                {view.description}
              </span>
            )}
          </div>
        </div>

        {/* View Type Label */}
        <div className="w-20 mr-4 text-[#9ca3af] text-sm">
          {viewTypeLabels[view.displayType as keyof typeof viewTypeLabels]}
        </div>

        {/* Visibility */}
        <div className="w-24 mr-4 flex items-center">
          <VisibilityIcon className={cn("h-4 w-4 mr-1", getVisibilityColor(view.visibility))} />
          <span className={cn("text-sm", getVisibilityColor(view.visibility))}>
            {view.visibility === 'WORKSPACE' ? 'Team' : 
             view.visibility === 'PERSONAL' ? 'Private' : 'Shared'}
          </span>
        </div>

        {/* Issue Count */}
        <div className="w-16 mr-4 text-[#666] text-sm text-right">
          {view._count?.issues !== undefined ? `${view._count.issues}` : '—'}
        </div>

        {/* Last Updated */}
        <div className="w-20 mr-4 text-[#666] text-xs text-right">
          {new Date(view.updatedAt).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>

        {/* Actions */}
        <div className="w-8 flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 h-6 w-6 text-[#666] hover:text-white"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              className="bg-[#090909] border-[#1f1f1f] text-white"
              align="end"
            >
              <DropdownMenuItem className="hover:bg-[#1f1f1f]">
                Edit view
              </DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-[#1f1f1f]">
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-[#1f1f1f]">
                {view.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#1f1f1f]" />
              <DropdownMenuItem className="hover:bg-[#1f1f1f] text-red-400">
                Delete view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      <div>
        {/* Section Header */}
        <div className="flex items-center px-6 py-2 bg-[#101011] sticky top-0 z-10">
          <span className="text-[#9ca3af] text-sm font-medium">
            {title}
          </span>
          <span className="ml-2 text-[#666] text-sm">
            {count}
          </span>
        </div>
        
        {/* Views */}
        <div>
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
      <div className="border-b border-[#1a1a1a] bg-[#101011] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-[#9ca3af]" />
              <h1 className="text-xl font-semibold text-white">Views</h1>
            </div>
            <span className="text-[#666] text-sm">
              {filteredViews.length} {filteredViews.length === 1 ? 'view' : 'views'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#666]" />
              <Input
                placeholder="Search views..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] focus:border-[#0969da] h-8"
              />
            </div>

            {/* New View */}
            <Button
              onClick={handleCreateView}
              size="sm"
              className="h-8 px-3 bg-[#0969da] hover:bg-[#0860ca] text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              New view
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {filteredViews.length > 0 ? (
          <div className="pb-16">
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