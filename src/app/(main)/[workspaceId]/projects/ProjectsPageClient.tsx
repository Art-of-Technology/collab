"use client";

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  FolderOpen, 
  MoreHorizontal,
  Calendar,
  Users,
  CheckSquare,
  Circle,
  Clock,
  CheckCircle2
} from 'lucide-react';

import { useProjects } from '@/hooks/queries/useProjects';
import { useViews } from '@/hooks/queries/useViews';
import { useWorkspace } from '@/context/WorkspaceContext';
import CreateProjectModal from '@/components/modals/CreateProjectModal';
import { cn } from '@/lib/utils';
import PageHeader, { pageHeaderButtonStyles, pageHeaderSearchStyles } from '@/components/layout/PageHeader';
import { format } from 'date-fns';

interface ProjectsPageClientProps {
  workspaceId: string;
}

export default function ProjectsPageClient({ workspaceId }: ProjectsPageClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: projects = [], isLoading } = useProjects({
    workspaceId,
    includeStats: true
  });

  const { data: views = [] } = useViews({
    workspaceId,
    includeStats: true,
  });

  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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

  // Helper function to get project status icon based on progress
  const getProjectStatusIcon = (project: any) => {
    const totalIssues = project._count?.issues || 0;
    const completedIssues = project._count?.completedIssues || 0;
    const progress = totalIssues > 0 ? (completedIssues / totalIssues) * 100 : 0;

    if (progress === 100) {
      return <CheckCircle2 className="h-3.5 w-3.5 text-[#22c55e]" fill="currentColor" />;
    } else if (progress > 0) {
      return <Clock className="h-3.5 w-3.5 text-[#3b82f6]" />;
    } else {
      return <Circle className="h-3.5 w-3.5 text-[#8b949e]" />;
    }
  };

  // Project Row Component - Similar to IssueRow in ListViewRenderer
  const ProjectRow = ({ project }: { project: any }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const totalIssues = project._count?.issues || 0;
    const completedIssues = project._count?.completedIssues || 0;
    const progress = totalIssues > 0 ? (completedIssues / totalIssues) * 100 : 0;

    // Handle clicks outside the dropdown
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setDropdownOpen(false);
        }
      };

      if (dropdownOpen) {
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
      }
    }, [dropdownOpen]);

    return (
      <div 
        className={cn(
          "group flex items-center px-6 py-3 border-b border-[#1f1f1f] transition-all duration-150 cursor-pointer",
          "hover:bg-[#0f1011] hover:border-[#333]",
          hoveredProjectId === project.id && "bg-[#0f1011]"
        )}
        onMouseEnter={() => setHoveredProjectId(project.id)}
        onMouseLeave={() => setHoveredProjectId(null)}
        onClick={(e) => {
          // Don't navigate if dropdown is open or click is from dropdown area
          if (!dropdownOpen && !dropdownRef.current?.contains(e.target as Node)) {
            handleProjectClick(project.slug, project.id);
          }
        }}
      >
        {/* Status Icon */}
        <div className="flex items-center w-6 mr-3 flex-shrink-0">
          {getProjectStatusIcon(project)}
        </div>

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
            <span className="text-[#e6edf3] text-sm font-medium truncate group-hover:text-[#58a6ff] transition-colors">
              {project.name}
            </span>
          </div>
          {project.description && (
            <div className="text-xs text-[#8b949e] mt-0.5 truncate">
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

          {/* Members Count */}
          <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded-md">
            <Users className="h-3 w-3" />
            <span className="text-[10px] font-medium">{project._count?.members || 0}</span>
          </div>

          {/* Progress Badge */}
          {totalIssues > 0 && (
            <Badge 
              className="h-5 px-2 text-[10px] font-medium leading-none border-0 rounded-md bg-opacity-80 hover:bg-opacity-100 transition-all"
              style={{ 
                backgroundColor: (project.color || '#6b7280') + '30',
                color: project.color || '#8b949e'
              }}
            >
              {Math.round(progress)}%
            </Badge>
          )}

          {/* Active Status */}
          <Badge className="h-4 px-1.5 text-[9px] font-medium leading-none bg-green-500/30 text-green-400 border-0 rounded-sm">
            Active
          </Badge>
        </div>

        {/* Updated Date */}
        <div className="flex-shrink-0 w-16 mr-3">
          <span className="text-[#6e7681] text-xs">
            {format(new Date(project.updatedAt), 'MMM d')}
          </span>
        </div>

        {/* Actions Menu */}
        <div className="flex-shrink-0 relative" ref={dropdownRef}>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 h-6 w-6 text-[#666] hover:text-[#ccc] hover:bg-[#2a2a2a]"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setDropdownOpen(!dropdownOpen);
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
          
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[#090909] border border-[#1f1f1f] rounded-md shadow-lg z-[1000]">
              <div className="py-1">
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#1a1a1a] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen(false);
                    router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${project.slug}/settings`);
                  }}
                >
                  Settings
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#1a1a1a] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen(false);
                    // Add duplicate functionality here
                  }}
                >
                  Duplicate
                </button>
                <div className="h-px bg-[#1f1f1f] my-1" />
                <button
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#1a1a1a] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen(false);
                    // Add archive functionality here
                  }}
                >
                  Archive project
                </button>
              </div>
            </div>
          )}
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
        title="Projects"
        subtitle={`${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}`}
        search={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-[#666]" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(pageHeaderSearchStyles, "w-64")}
            />
          </div>
        }
        actions={
          <Button
            onClick={handleCreateProject}
            className={cn(pageHeaderButtonStyles.primary, "h-7 px-3")}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New project
          </Button>
        }
      />

      {/* Projects List Content */}
      <div className="flex-1 overflow-auto">
        {filteredProjects.length > 0 ? (
          <div>
            {filteredProjects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </div>
        ) : searchQuery ? (
          <div className="flex items-center justify-center h-64 text-[#8b949e]">
            <div className="text-center">
              <Search className="h-8 w-8 mx-auto mb-2 text-[#6e7681]" />
              <p className="text-sm">No projects match your search</p>
              <p className="text-xs text-[#6e7681] mt-1">
                Try different keywords
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
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
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          workspaceId={workspaceId}
          onProjectCreated={(project) => {
            console.log("Project created:", project);
            // The useCreateProject hook will automatically invalidate queries
          }}
        />
      )}
    </div>
  );
} 