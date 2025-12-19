"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Plus,
  FolderOpen,
  Settings,
  Archive,
  CheckSquare,
  Github,
  Tag,
  GitBranch,
  ArrowUpRight,
  MoreHorizontal,
  Loader2,
  Sparkles,
  ExternalLink,
  Clock,
  Filter,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useProjects, useArchiveProject } from '@/hooks/queries/useProjects';
import { useViews } from '@/hooks/queries/useViews';
import { useWorkspace } from '@/context/WorkspaceContext';
import CreateProjectModal from '@/components/modals/CreateProjectModal';
import { ProjectArchiveConfirmationModal } from '@/components/ProjectArchiveConfirmationModal';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

type ProjectStatusFilter = 'active' | 'archived' | 'all';

interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  issuePrefix?: string;
  isArchived?: boolean;
  issueCount?: number;
  updatedAt: string;
  createdAt: string;
  repository?: {
    id: string;
    fullName: string;
    _count?: {
      branches: number;
      commits: number;
      releases: number;
      versions: number;
    };
  } | null;
}

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
    const defaultView = getDefaultViewForProject(projectId);
    const href = defaultView
      ? `/${currentWorkspace?.slug || currentWorkspace?.id}/views/${(defaultView as { slug?: string; id: string }).slug || (defaultView as { id: string }).id}`
      : `/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${projectSlug}`;

    router.push(href);
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
          <Button
            onClick={() => setShowCreateModal(true)}
            size="sm"
            className="h-8 bg-[#238636] hover:bg-[#2ea043] text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Project
          </Button>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
              {filteredProjects.map((project: Project) => (
                <ProjectCard
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

// Project Card Component
function ProjectCard({
  project,
  workspaceSlug,
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
        "group rounded-lg border bg-[#0d0d0e] overflow-hidden transition-all hover:border-[#30363d] flex flex-col h-full",
        isArchived ? "border-[#1f1f1f] opacity-70" : "border-[#1f1f1f]"
      )}
    >
      {/* Card Header */}
      <div
        className="p-4 cursor-pointer flex-1 flex flex-col"
        onClick={onProjectClick}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: project.color || '#6e7681' }}
            >
              <FolderOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors">
                  {project.name}
                </h3>
                {isArchived && (
                  <Badge className="text-[10px] h-4 px-1.5 bg-[#1f1f1f] text-[#6e7681] border-0">
                    Archived
                  </Badge>
                )}
              </div>
              {project.issuePrefix && (
                <span className="text-xs text-[#6e7681] font-mono">{project.issuePrefix}</span>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#161617] opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-[#161617] border-[#1f1f1f]">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToSettings();
                }}
                className="text-[#e6edf3] focus:bg-[#1f1f1f] cursor-pointer"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#1f1f1f]" />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
                className={cn(
                  "cursor-pointer",
                  isArchived
                    ? "text-[#58a6ff] focus:bg-[#1f1f1f]"
                    : "text-[#f0883e] focus:bg-[#1f1f1f]"
                )}
              >
                <Archive className="h-4 w-4 mr-2" />
                {isArchived ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {project.description && (
          <p className="text-xs text-[#6e7681] line-clamp-2 mb-3">
            {project.description}
          </p>
        )}

        {/* Stats - push to bottom */}
        <div className="flex items-center gap-3 flex-wrap mt-auto">
          <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
            <CheckSquare className="h-3.5 w-3.5 text-[#58a6ff]" />
            <span>{project.issueCount || 0} issues</span>
          </div>

          {hasGitHub && project.repository?._count && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                <GitBranch className="h-3.5 w-3.5 text-[#3fb950]" />
                <span>{project.repository._count.branches}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                <Tag className="h-3.5 w-3.5 text-[#a371f7]" />
                <span>{project.repository._count.releases}</span>
              </div>
            </>
          )}

          <div className="flex items-center gap-1.5 text-xs text-[#6e7681] ml-auto">
            <Clock className="h-3 w-3" />
            <span>{formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions Footer */}
      <div className="flex items-center border-t border-[#1f1f1f] divide-x divide-[#1f1f1f]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onProjectClick();
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617] transition-colors"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Issues
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToGithub();
          }}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 text-xs transition-colors",
            hasGitHub
              ? "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617]"
              : "text-[#6e7681] hover:text-[#8b949e] hover:bg-[#161617]"
          )}
        >
          <Github className="h-3.5 w-3.5" />
          GitHub
          {!hasGitHub && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-[#1f1f1f] text-[#6e7681]">
              Connect
            </span>
          )}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToChangelog();
          }}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 text-xs transition-colors",
            hasGitHub
              ? "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161617]"
              : "text-[#6e7681] hover:text-[#8b949e] hover:bg-[#161617]"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Changelog
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
