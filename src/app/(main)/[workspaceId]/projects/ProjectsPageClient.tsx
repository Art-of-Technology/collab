"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
              <FolderOpen className="h-4 w-4 text-[#a371f7]" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-[#e6edf3]">Projects</h1>
              <p className="text-xs text-[#6e7681]">
                {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/timeline`)}
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#1a1a1a]"
              title="View Timeline"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              size="sm"
              className="h-8 bg-[#238636] hover:bg-[#2ea043] text-white"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Project
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 pb-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6e7681]" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-[#0d0d0e] border-[#1f1f1f] text-[#e6edf3] placeholder:text-[#6e7681] focus:border-[#30363d]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#1f1f1f] p-0.5 bg-[#0d0d0e]">
            {(['active', 'archived', 'all'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setProjectFilter(filter)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  projectFilter === filter
                    ? "bg-[#1f1f1f] text-[#e6edf3]"
                    : "text-[#6e7681] hover:text-[#8b949e]"
                )}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                <span className="ml-1.5 text-[#6e7681]">
                  {projectCounts[filter]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {filteredProjects.length > 0 ? (
            <div className="rounded-lg border border-[#1f1f1f] overflow-hidden divide-y divide-[#1f1f1f]">
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
      </ScrollArea>

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

// Project List Item Component
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

  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200 cursor-pointer",
        isArchived && "opacity-40"
      )}
      onClick={onProjectClick}
    >
      {/* Color indicator */}
      <div
        className="w-1 h-8 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: project.color || '#6366f1' }}
      />

      {/* Project Info */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2.5">
          <h3 className="text-[14px] font-semibold text-[#fafafa] group-hover:text-white truncate">
            {project.name}
          </h3>
          {project.issuePrefix && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f23] text-[#71717a] font-mono">
              {project.issuePrefix}
            </span>
          )}
          {isArchived && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#27272a] text-[#a1a1aa] uppercase tracking-wider font-medium">
              archived
            </span>
          )}
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-[12px] text-[#52525b] truncate max-w-[280px] mt-0.5">
            {project.description}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
            <CheckSquare className="h-3 w-3 text-[#3b82f6]" />
            <span className="tabular-nums">{project.issueCount || 0}</span>
          </div>

          {hasGitHub && project.repository?._count && (
            <>
              <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
                <GitBranch className="h-3 w-3 text-[#22c55e]" />
                <span className="tabular-nums">{project.repository._count.branches}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
                <Tag className="h-3 w-3 text-[#a855f7]" />
                <span className="tabular-nums">{project.repository._count.releases}</span>
              </div>
            </>
          )}

          <span className="text-[10px] text-[#3f3f46]">
            {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Inline Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onProjectClick();
          }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-[#a1a1aa] hover:text-white hover:bg-[#27272a] transition-colors"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          <span>Issues</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToGithub();
          }}
          className={cn(
            "flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors",
            hasGitHub
              ? "text-[#a1a1aa] hover:text-white hover:bg-[#27272a]"
              : "text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#27272a]"
          )}
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span>GitHub</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToChangelog();
          }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-[#a1a1aa] hover:text-white hover:bg-[#27272a] transition-colors"
        >
          <Tag className="h-3.5 w-3.5" />
          <span>Releases</span>
        </button>

        <div className="w-px h-5 bg-[#27272a] mx-1" />

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToSettings();
          }}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-[#71717a] hover:text-white hover:bg-[#27272a] transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
            isArchived
              ? "text-[#60a5fa] hover:text-[#93c5fd] hover:bg-[#27272a]"
              : "text-[#71717a] hover:text-[#f97316] hover:bg-[#27272a]"
          )}
          title={isArchived ? 'Restore' : 'Archive'}
        >
          <Archive className="h-4 w-4" />
        </button>
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
      <h3 className="text-sm font-medium text-[#e6edf3] mb-1">No projects found</h3>
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
        <FolderOpen className="h-8 w-8 text-[#6e7681]" />
      </div>
      <h3 className="text-sm font-medium text-[#e6edf3] mb-1">No projects yet</h3>
      <p className="text-xs text-[#6e7681] mb-4 text-center max-w-sm">
        Projects help you organize your work into focused areas.
        Connect GitHub repositories to track releases and generate changelogs.
      </p>
      <Button
        onClick={onCreate}
        size="sm"
        className="h-8 bg-[#238636] hover:bg-[#2ea043] text-white"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Create your first project
      </Button>
    </div>
  );
}
