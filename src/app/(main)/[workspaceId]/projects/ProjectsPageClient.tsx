"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Plus,
  FolderOpen,
  Settings,
  Archive,
  CheckSquare,
  Tag,
  GitBranch,
  Loader2,
  BarChart3,
} from 'lucide-react';

import { useProjects, useArchiveProject, type Project } from '@/hooks/queries/useProjects';
import { useViews } from '@/hooks/queries/useViews';
import { useWorkspace } from '@/context/WorkspaceContext';
import CreateProjectModal from '@/components/modals/CreateProjectModal';
import { ProjectArchiveConfirmationModal } from '@/components/ProjectArchiveConfirmationModal';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type ProjectStatusFilter = 'active' | 'archived' | 'all';

export default function ProjectsPageClient() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const filteredProjects = projects.filter((project: Project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const isArchived = project.isArchived === true;
    const matchesFilter = projectFilter === 'all' ||
      (projectFilter === 'archived' && isArchived) ||
      (projectFilter === 'active' && !isArchived);

    return matchesSearch && matchesFilter;
  });

  const getDefaultViewForProject = (projectId: string) => {
    return views.find((view: { projectIds: string[]; isDefault?: boolean }) =>
      view.projectIds.includes(projectId) && view.isDefault
    );
  };

  const handleProjectClick = (projectSlug: string, projectId: string) => {
    // Navigate to project dashboard
    router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${projectSlug}`);
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

  // Calculate project counts
  const projectCounts = {
    active: projects.filter((p: Project) => !p.isArchived).length,
    archived: projects.filter((p: Project) => p.isArchived === true).length,
    all: projects.length
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-[#1f1f22] border-t-[#75757a] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-white mb-1">Projects</h1>
            <p className="text-sm text-[#75757a]">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/timeline`)}
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-[#75757a] hover:text-[#fafafa] hover:bg-[#1f1f22] rounded-xl"
              title="View Timeline"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              size="sm"
              className="h-9 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        {/* Search and Tab Toggle - matching notes page */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75757a]" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-[#171719] border-[#1f1f22] text-[#fafafa] placeholder:text-[#75757a] focus:border-[#27272b] rounded-xl"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-[#1f1f22] p-1 bg-[#171719]">
            {(['active', 'archived', 'all'] as const).map((filter) => {
              const isActive = projectFilter === filter;
              const Icon = filter === 'archived' ? Archive : filter === 'all' ? FolderOpen : CheckSquare;
              return (
                <Button
                  key={filter}
                  variant="ghost"
                  size="sm"
                  onClick={() => setProjectFilter(filter)}
                  className={cn(
                    "h-8 px-3 gap-1.5 rounded-lg",
                    isActive
                      ? "bg-[#27272b] text-[#fafafa]"
                      : "text-[#75757a] hover:text-[#9c9ca1] hover:bg-transparent"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  <span className={cn(isActive ? "text-[#9c9ca1]" : "text-[#52525b]")}>
                    {projectCounts[filter]}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {filteredProjects.length > 0 ? (
          <div className="rounded-2xl border border-[#1f1f22] bg-[#171719] overflow-hidden divide-y divide-[#1f1f22]">
            {filteredProjects.map((project: Project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                workspaceSlug={currentWorkspace?.slug || currentWorkspace?.id || ''}
                onProjectClick={() => handleProjectClick(project.slug, project.id)}
                onArchive={() => handleArchiveProject(project)}
                onNavigateToGithub={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/github`)}
                onNavigateToChangelog={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/changelog`)}
                onNavigateToSettings={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/settings`)}
              />
            ))}
          </div>
        ) : searchQuery ? (
          <EmptySearch onClear={() => setSearchQuery('')} />
        ) : (
          <EmptyState onCreate={() => setShowCreateModal(true)} />
        )}
      </div>

      {/* Modals */}
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

      <ProjectArchiveConfirmationModal
        isOpen={archiveModal.isOpen}
        onClose={() => setArchiveModal({ isOpen: false, project: null })}
        onConfirm={handleArchiveConfirm}
        project={archiveModal.project}
        isLoading={archiveProjectMutation.isPending}
      />
    </div>
  );
}

// Project List Item Component - Matching Notes page design
function ProjectListItem({
  project,
  onProjectClick,
  onArchive,
  onNavigateToGithub,
  onNavigateToChangelog,
  onNavigateToSettings,
}: {
  project: Project;
  workspaceSlug: string;
  onProjectClick: () => void;
  onArchive: () => void;
  onNavigateToGithub: () => void;
  onNavigateToChangelog: () => void;
  onNavigateToSettings: () => void;
}) {
  const isArchived = project.isArchived === true;
  const hasGitHub = !!project.repository;
  const projectColor = project.color || '#6366f1';

  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 hover:bg-[#1f1f22] transition-all duration-200 cursor-pointer",
        isArchived && "opacity-50"
      )}
      onClick={onProjectClick}
    >
      {/* Color indicator - matches notes page style */}
      <div
        className="w-1 h-12 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: projectColor }}
      />

      {/* Project Info */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-medium text-[#fafafa] group-hover:text-white truncate">
            {project.name}
          </h3>
          {project.issuePrefix && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-[#27272b] text-[#75757a] font-mono flex-shrink-0">
              {project.issuePrefix}
            </span>
          )}
          {isArchived && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-[#f97316]/10 text-[#f97316] flex-shrink-0">
              Archived
            </span>
          )}
          {hasGitHub && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-[#22c55e]/10 text-[#22c55e] flex-shrink-0 flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              Connected
            </span>
          )}
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-sm text-[#75757a] truncate max-w-[500px] mt-1">
            {project.description}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-2">
          {/* Issues */}
          <div className="flex items-center gap-1.5 text-xs text-[#75757a]">
            <CheckSquare className="h-3.5 w-3.5 text-[#3b82f6]" />
            <span className="tabular-nums">{project.issueCount || 0}</span>
            <span className="text-[#52525b]">issues</span>
          </div>

          {/* GitHub stats */}
          {hasGitHub && project.repository?._count && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-[#75757a]">
                <GitBranch className="h-3.5 w-3.5 text-[#22c55e]" />
                <span className="tabular-nums">{project.repository._count.branches}</span>
                <span className="text-[#52525b]">branches</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#75757a]">
                <Tag className="h-3.5 w-3.5 text-[#a855f7]" />
                <span className="tabular-nums">{project.repository._count.releases}</span>
                <span className="text-[#52525b]">releases</span>
              </div>
            </>
          )}

          {/* Updated time */}
          <span className="text-xs text-[#52525b]">
            {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Inline Actions - matching notes page */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToGithub();
          }}
          className={cn(
            "h-8 px-3 gap-1.5 rounded-lg",
            hasGitHub
              ? "text-[#75757a] hover:text-[#fafafa] hover:bg-[#27272b]"
              : "text-[#52525b] hover:text-[#75757a] hover:bg-[#27272b]"
          )}
        >
          <GitBranch className="h-4 w-4" />
          <span>GitHub</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToChangelog();
          }}
          className="h-8 px-3 gap-1.5 rounded-lg text-[#75757a] hover:text-[#fafafa] hover:bg-[#27272b]"
        >
          <Tag className="h-4 w-4" />
          <span>Releases</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToSettings();
          }}
          className="h-8 w-8 rounded-lg text-[#75757a] hover:text-[#fafafa] hover:bg-[#27272b]"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          className={cn(
            "h-8 w-8 rounded-lg",
            isArchived
              ? "text-[#22c55e] hover:text-[#4ade80] hover:bg-[#22c55e]/10"
              : "text-[#75757a] hover:text-[#f97316] hover:bg-[#f97316]/10"
          )}
          title={isArchived ? 'Restore' : 'Archive'}
        >
          <Archive className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Empty Search State
function EmptySearch({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-[#1f1f22] bg-[#171719]">
      <div className="p-4 rounded-2xl bg-[#101011] mb-4">
        <Search className="h-8 w-8 text-[#52525b]" />
      </div>
      <h3 className="text-sm font-medium text-[#9c9ca1] mb-1">No projects found</h3>
      <p className="text-xs text-[#75757a] mb-4">Try different keywords</p>
      <Button
        onClick={onClear}
        variant="ghost"
        size="sm"
        className="h-8 px-4 text-xs text-[#9c9ca1] hover:text-[#fafafa] hover:bg-[#1f1f22] rounded-lg"
      >
        Clear search
      </Button>
    </div>
  );
}

// Empty State
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-[#1f1f22] bg-[#171719]">
      <div className="p-4 rounded-2xl bg-[#101011] mb-4">
        <FolderOpen className="h-8 w-8 text-[#52525b]" />
      </div>
      <h3 className="text-sm font-medium text-[#9c9ca1] mb-1">No projects yet</h3>
      <p className="text-xs text-[#75757a] mb-4 text-center max-w-sm">
        Projects help you organize your work into focused areas.
        Connect GitHub repositories to track releases and generate changelogs.
      </p>
      <Button
        onClick={onCreate}
        size="sm"
        className="h-9 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
      >
        <Plus className="h-4 w-4 mr-2" />
        Create your first project
      </Button>
    </div>
  );
}
