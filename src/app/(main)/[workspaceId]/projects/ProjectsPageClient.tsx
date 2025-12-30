"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  SearchIcon,
  Plus,
  FolderOpen,
  Settings,
  Archive,
  CheckSquare,
  BarChart3,
} from 'lucide-react';

import { useProjects, useArchiveProject } from '@/hooks/queries/useProjects';
import { useViews } from '@/hooks/queries/useViews';
import { useWorkspace } from '@/context/WorkspaceContext';
import CreateProjectModal from '@/components/modals/CreateProjectModal';
import ProjectsGanttModal from '@/components/modals/ProjectsGanttModal';
import { ProjectArchiveConfirmationModal } from '@/components/ProjectArchiveConfirmationModal';
import { ProjectStatusSelector, type ProjectStatusFilter } from '@/components/ProjectStatusSelector';
import { cn } from '@/lib/utils';
import PageHeader, { pageHeaderButtonStyles, pageHeaderSearchStyles } from '@/components/layout/PageHeader';
import { format } from 'date-fns';

export default function ProjectsPageClient() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGanttModal, setShowGanttModal] = useState(false);
  const [projectFilter, setProjectFilter] = useState<ProjectStatusFilter>('active');
  const [archiveModal, setArchiveModal] = useState<{
    isOpen: boolean;
    project: { id: string; name: string; isArchived: boolean } | null;
  }>({
    isOpen: false,
    project: null
  });

  const { data: projects = [], isLoading } = useProjects({
    workspaceId: currentWorkspace?.id,
    includeStats: true
  });

  const { data: views = [] } = useViews({
    workspaceId: currentWorkspace?.id,
    includeStats: true,
  });

  const archiveProjectMutation = useArchiveProject();

  const filteredProjects = projects.filter(project => {
    // Filter by search query
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()));

    // Filter by archive status
    const isArchived = project.isArchived === true;
    const matchesFilter = projectFilter === 'all' ||
      (projectFilter === 'archived' && isArchived) ||
      (projectFilter === 'active' && !isArchived);

    return matchesSearch && matchesFilter;
  });

  // Helper function to find default view for a project (same as in Sidebar)
  const getDefaultViewForProject = (projectId: string) => {
    return views.find(view =>
      view.projectIds.includes(projectId) && view.isDefault
    );
  };

  const handleProjectClick = (projectSlug: string, projectId: string) => {
    const defaultView = getDefaultViewForProject(projectId);
    const href = defaultView
      ? `/${currentWorkspace?.slug || currentWorkspace?.id}/views/${defaultView.slug || defaultView.id}`
      : `/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${projectSlug}`;

    router.push(href);
  };

  const handleCreateProject = () => {
    setShowCreateModal(true);
  };

  const handleArchiveProject = (project: { id: string; name: string; isArchived?: boolean }) => {
    setArchiveModal({
      isOpen: true,
      project: {
        id: project.id,
        name: project.name,
        isArchived: project.isArchived === true
      }
    });
  };

  const handleArchiveConfirm = async () => {
    if (!archiveModal.project) return;

    try {
      await archiveProjectMutation.mutateAsync({
        projectId: archiveModal.project.id,
        isArchived: !archiveModal.project.isArchived
      });
      setArchiveModal({ isOpen: false, project: null });
    } catch (error) {
      console.error('Error updating project archive status:', error);
    }
  };

  const handleArchiveCancel = () => {
    setArchiveModal({ isOpen: false, project: null });
  };

  // Calculate project counts for the status selector
  const projectCounts = {
    active: projects.filter(p => !p.isArchived).length,
    archived: projects.filter(p => p.isArchived === true).length,
    all: projects.length
  };

  // Project Row Component - Similar to IssueRow in ListViewRenderer
  const ProjectRow = ({ project }: { project: any }) => {
    const totalIssues = project.issueCount || 0;
    const isArchived = project.isArchived === true;

    return (
      <div
        className={cn(
          "group relative cursor-pointer transition-all duration-200",
          // Mobile-first: Card-like design with glassmorphism
          "mx-3 mb-3 p-4 rounded-xl",
          "bg-white/5 hover:bg-white/10 backdrop-blur-sm",
          "border border-white/10 hover:border-white/20",
          // Desktop: More compact list style
          "md:mx-0 md:mb-0 md:p-3 md:rounded-lg md:border-0 md:border-b md:border-[#1f1f1f]",
          "md:bg-transparent md:hover:bg-[#0f1011] md:backdrop-blur-none md:hover:border-[#333]",
          hoveredProjectId === project.id && "md:bg-[#0f1011]"
        )}
        onMouseEnter={() => setHoveredProjectId(project.id)}
        onMouseLeave={() => setHoveredProjectId(null)}
        onClick={() => handleProjectClick(project.slug, project.id)}
      >
        {/* Mobile Layout */}
        <div className="md:hidden">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Project Icon */}
              <div
                className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                style={{ backgroundColor: project.color || '#6b7280' }}
              >
                <FolderOpen className="h-3.5 w-3.5 text-white" />
              </div>

              {/* Project Name */}
              <span className="text-white text-sm font-medium truncate">
                {project.name}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/settings`);
                }}
                title="Settings"
              >
                <Settings className="h-4 w-4 text-gray-400" />
              </button>

              <button
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  isArchived
                    ? "hover:bg-blue-500/10 text-blue-400"
                    : "hover:bg-orange-500/10 text-orange-400"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchiveProject(project);
                }}
                title={isArchived ? "Unarchive project" : "Archive project"}
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Description */}
          {project.description && (
            <p className="text-gray-500 text-xs mb-2 line-clamp-2">
              {project.description}
            </p>
          )}

          {/* Stats and metadata row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Issues Count */}
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-md">
                <CheckSquare className="h-3 w-3" />
                <span className="text-xs font-medium">{project.issueCount || 0}</span>
              </div>

              {/* Badge Status */}
              {isArchived ? (
                <Badge className="h-6 px-2 text-xs font-medium leading-none bg-blue-500/30 text-blue-400 border-0 rounded-sm">
                  Archived
                </Badge>
              ) : (
                <Badge className="h-6 px-2 text-xs font-medium leading-none bg-green-500/30 text-green-400 border-0 rounded-sm">
                  Active
                </Badge>
              )}

            </div>

            {/* Updated Date */}
            <span className="text-gray-500 text-xs">
              {format(new Date(project.updatedAt), 'MMM d')}
            </span>
          </div>
        </div>

        {/* Desktop Layout - Original structure */}
        <div className="hidden md:flex md:items-center">
          {/* Project Icon */}
          <div className="flex items-center w-8 mr-3 flex-shrink-0">
            <div
              className="w-6 h-6 rounded flex items-center justify-center"
              style={{ backgroundColor: project.color || '#6b7280' }}
            >
              <FolderOpen className="h-3.5 w-3.5 text-white" />
            </div>
          </div>

          {/* Project Name and Description */}
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-medium truncate group-hover:text-blue-400 transition-colors">
                {project.name}
              </span>
            </div>
            {project.description && (
              <div className="text-xs text-gray-500 mt-0.5 truncate">
                {project.description}
              </div>
            )}
          </div>

          {/* Stats Section */}
          <div className="flex items-center gap-3 flex-shrink-0 mr-4">
            {/* Issues Count */}
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-md">
              <CheckSquare className="h-3 w-3" />
              <span className="text-[10px] font-medium">{totalIssues}</span>
            </div>


            {/* Badge Status */}
            {isArchived ? (
              <Badge className="h-6 px-2 text-xs font-medium leading-none bg-blue-500/30 text-blue-400 border-0 rounded-sm">
                Archived
              </Badge>
            ) : (
              <Badge className="h-6 px-2 text-xs font-medium leading-none bg-green-500/30 text-green-400 border-0 rounded-sm">
                Active
              </Badge>
            )}
          </div>

          {/* Updated Date */}
          <div className="flex-shrink-0 w-16 mr-3">
            <span className="text-gray-500 text-xs">
              {format(new Date(project.updatedAt), 'MMM d')}
            </span>
          </div>

          {/* Actions Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/settings`);
              }}
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-6 w-6 transition-colors",
                isArchived
                  ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                  : "text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleArchiveProject(project);
              }}
              title={isArchived ? "Unarchive project" : "Archive project"}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#101011]">
      {/* Header using PageHeader component */}
      <PageHeader
        icon={FolderOpen}
        title={
          <div className="flex items-center gap-3">
            Projects
            <ProjectStatusSelector
              value={projectFilter}
              onChange={setProjectFilter}
              counts={projectCounts}
            />
          </div>
        }
        subtitle={`${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}`}
        search={
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(pageHeaderSearchStyles, "w-full md:w-64")}
            />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowGanttModal(true)}
              variant="ghost"
              className="h-8 px-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
              title="View Gantt Chart"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleCreateProject}
              className={pageHeaderButtonStyles.primary}
            >
              <Plus className="h-3.5 w-3.5 md:mr-1.5" />
              <span data-text className="hidden md:inline ml-1">New project</span>
            </Button>
          </div>
        }
      />

      {/* Projects List Content */}
      <div className="flex-1 overflow-auto">
        {filteredProjects.length > 0 ? (
          <div className="pb-20 md:pb-16 md:divide-y md:divide-[#1a1a1a]">
            {filteredProjects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        ) : searchQuery ? (
          <div className="flex items-center justify-center h-64 text-[#8b949e]">
            <div className="text-center">
              <SearchIcon className="h-8 w-8 mx-auto mb-2  text-muted-foreground z-10" />
              <p className="text-sm">No projects match your search</p>
              <p className="text-xs text-[#6e7681] mt-1">
                Try different keywords
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="w-12 h-12 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
              <FolderOpen className="h-6 w-6 text-[#666]" />
            </div>
            <p className="text-[#9ca3af] text-sm mb-1">No projects found</p>
            <p className="text-[#666] text-xs mb-4">
              Projects help you organize your work into focused areas
            </p>
            <Button
              onClick={handleCreateProject}
              className={cn(pageHeaderButtonStyles.primary, "h-7 px-3")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create your first project
            </Button>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          workspaceId={currentWorkspace?.id || ""}
          onProjectCreated={(project) => {
            console.log("Project created:", project);
          }}
        />
      )}

      {/* Archive Confirmation Modal */}
      <ProjectArchiveConfirmationModal
        isOpen={archiveModal.isOpen}
        onClose={handleArchiveCancel}
        onConfirm={handleArchiveConfirm}
        project={archiveModal.project}
        isLoading={archiveProjectMutation.isPending}
      />

      {/* Gantt Chart Modal */}
      <ProjectsGanttModal
        isOpen={showGanttModal}
        onClose={() => setShowGanttModal(false)}
        workspaceId={currentWorkspace?.id || ""}
      />
    </div>
  );
} 