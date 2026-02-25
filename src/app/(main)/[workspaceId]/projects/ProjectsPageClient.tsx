"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Search,
  Plus,
  FolderOpen,
  Settings,
  Archive,
  CheckSquare,
  Tag,
  GitBranch,
  BarChart3,
} from 'lucide-react';

import { useProjects, useArchiveProject, type Project } from '@/hooks/queries/useProjects';
import { useViews } from '@/hooks/queries/useViews';
import { useWorkspace } from '@/context/WorkspaceContext';
import CreateProjectModal from '@/components/modals/CreateProjectModal';
import { ProjectArchiveConfirmationModal } from '@/components/ProjectArchiveConfirmationModal';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { PageLayout } from '@/components/ui/page-layout';
import { PageHeader } from '@/components/ui/page-header';
import { SearchBar } from '@/components/ui/search-bar';
import { FilterToggle } from '@/components/ui/filter-toggle';
import { ShadowListGroup } from '@/components/ui/shadow-list-group';
import { EmptyState } from '@/components/ui/empty-state';

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

  const projectCounts = {
    active: projects.filter((p: Project) => !p.isArchived).length,
    archived: projects.filter((p: Project) => p.isArchived === true).length,
    all: projects.length
  };

  const filterOptions = [
    { id: 'active', label: 'Active', count: projectCounts.active, icon: <CheckSquare className="h-3 w-3" /> },
    { id: 'archived', label: 'Archived', count: projectCounts.archived, icon: <Archive className="h-3 w-3" /> },
    { id: 'all', label: 'All', count: projectCounts.all, icon: <FolderOpen className="h-3 w-3" /> },
  ];

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-collab-700 border-t-collab-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Projects"
        subtitle={`${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/timeline`)}
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-collab-500 hover:text-collab-50 hover:bg-collab-700 rounded-xl"
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
        }
      >
        <div className="flex items-center gap-3">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search projects..."
          />
          <FilterToggle
            options={filterOptions}
            value={projectFilter}
            onChange={(id) => setProjectFilter(id as ProjectStatusFilter)}
          />
        </div>
      </PageHeader>

      {filteredProjects.length > 0 ? (
        <ShadowListGroup>
          {filteredProjects.map((project: Project) => (
            <ShadowListGroup.Item key={project.id} className="!p-0">
              <ProjectListItem
                project={project}
                workspaceSlug={currentWorkspace?.slug || currentWorkspace?.id || ''}
                onProjectClick={() => handleProjectClick(project.slug, project.id)}
                onArchive={() => handleArchiveProject(project)}
                onNavigateToGithub={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/github`)}
                onNavigateToChangelog={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/changelog`)}
                onNavigateToSettings={() => router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/settings`)}
              />
            </ShadowListGroup.Item>
          ))}
        </ShadowListGroup>
      ) : searchQuery ? (
        <EmptyState
          icon={<Search className="h-8 w-8 text-collab-500/60" />}
          title="No projects found"
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
          icon={<FolderOpen className="h-8 w-8 text-collab-500/60" />}
          title="No projects yet"
          description="Projects help you organize your work into focused areas. Connect GitHub repositories to track releases and generate changelogs."
          action={
            <Button
              onClick={() => setShowCreateModal(true)}
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create your first project
            </Button>
          }
        />
      )}

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
    </PageLayout>
  );
}

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
        "group relative flex items-center gap-4 px-5 py-4 hover:bg-collab-700/50 transition-all duration-200 cursor-pointer",
        isArchived && "opacity-50"
      )}
      onClick={onProjectClick}
    >
      <div
        className="w-1 h-12 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: projectColor }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-medium text-collab-50 group-hover:text-white truncate">
            {project.name}
          </h3>
          {project.issuePrefix && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-collab-600 text-collab-500 font-mono flex-shrink-0">
              {project.issuePrefix}
            </span>
          )}
          {isArchived && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-orange-500/10 text-orange-500 flex-shrink-0">
              Archived
            </span>
          )}
          {hasGitHub && (
            <span className="text-xs px-2 py-0.5 rounded-lg bg-green-500/10 text-green-500 flex-shrink-0 flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              Connected
            </span>
          )}
        </div>

        {project.description && (
          <p className="text-sm text-collab-500 truncate max-w-[500px] mt-1">
            {project.description}
          </p>
        )}

        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-collab-500">
            <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
            <span className="tabular-nums">{project.issueCount || 0}</span>
            <span className="text-collab-500/60">issues</span>
          </div>

          {hasGitHub && project.repository?._count && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-collab-500">
                <GitBranch className="h-3.5 w-3.5 text-green-500" />
                <span className="tabular-nums">{project.repository._count.branches}</span>
                <span className="text-collab-500/60">branches</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-collab-500">
                <Tag className="h-3.5 w-3.5 text-violet-500" />
                <span className="tabular-nums">{project.repository._count.releases}</span>
                <span className="text-collab-500/60">releases</span>
              </div>
            </>
          )}

          <span className="text-xs text-collab-500/60">
            {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

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
              ? "text-collab-500 hover:text-collab-50 hover:bg-collab-600"
              : "text-collab-500/60 hover:text-collab-500 hover:bg-collab-600"
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
          className="h-8 px-3 gap-1.5 rounded-lg text-collab-500 hover:text-collab-50 hover:bg-collab-600"
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
          className="h-8 w-8 rounded-lg text-collab-500 hover:text-collab-50 hover:bg-collab-600"
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
              ? "text-green-500 hover:text-green-400 hover:bg-green-500/10"
              : "text-collab-500 hover:text-orange-500 hover:bg-orange-500/10"
          )}
          title={isArchived ? 'Restore' : 'Archive'}
        >
          <Archive className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
