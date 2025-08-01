"use client";

import { useState } from 'react';
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
  CheckSquare
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from '@/hooks/queries/useProjects';
import { useWorkspace } from '@/context/WorkspaceContext';
import { cn } from '@/lib/utils';

interface ProjectsPageClientProps {
  workspaceId: string;
}

export default function ProjectsPageClient({ workspaceId }: ProjectsPageClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: projects = [], isLoading } = useProjects({
    workspaceId,
    includeStats: true
  });

  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleProjectClick = (projectSlug: string) => {
    router.push(`/${currentWorkspace?.slug || currentWorkspace?.id}/projects/${projectSlug}`);
  };

  const handleCreateProject = () => {
    // TODO: Open create project modal
    console.log('Create new project');
  };

  const ProjectCard = ({ project }: { project: any }) => {
    return (
      <div
        className="group p-6 rounded-lg border border-[#1f1f1f] bg-[#090909] hover:bg-[#1f1f1f] hover:border-[#2a2a2a] transition-all cursor-pointer"
        onClick={() => handleProjectClick(project.slug)}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: project.color || '#6b7280' }}
            >
              <FolderOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">{project.name}</h3>
              <p className="text-sm text-gray-400 mt-1">{project.description || 'No description'}</p>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 h-8 w-8 text-gray-400 hover:text-white hover:bg-[#2a2a2a]"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#090909] border-[#1f1f1f]">
              <DropdownMenuItem className="text-gray-300">Edit project</DropdownMenuItem>
              <DropdownMenuItem className="text-gray-300">Project settings</DropdownMenuItem>
              <DropdownMenuItem className="text-gray-300">Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#1f1f1f]" />
              <DropdownMenuItem className="text-red-400">Archive project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-4">
          {/* Project stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-[#1f1f1f]">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckSquare className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-300">Issues</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {project._count?.issues || 0}
              </div>
            </div>
            
            <div className="text-center p-3 rounded-lg bg-[#1f1f1f]">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-gray-300">Members</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {project._count?.members || 0}
              </div>
            </div>
            
            <div className="text-center p-3 rounded-lg bg-[#1f1f1f]">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium text-gray-300">Views</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {project._count?.views || 0}
              </div>
            </div>
          </div>

          {/* Project progress */}
          {project._count?.issues > 0 && (
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Progress</span>
                <span className="text-gray-400">
                  {Math.round(((project._count?.completedIssues || 0) / project._count.issues) * 100)}%
                </span>
              </div>
              <div className="w-full bg-[#1f1f1f] rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all"
                  style={{ 
                    backgroundColor: project.color || '#6b7280',
                    width: `${((project._count?.completedIssues || 0) / project._count.issues) * 100}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Last updated */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Updated {new Date(project.updatedAt).toLocaleDateString()}
            </span>
            <Badge 
              variant="secondary" 
              className="bg-green-500/10 text-green-400 border-green-500/20"
            >
              Active
            </Badge>
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
      {/* Header */}
      <div className="border-b border-[#1f1f1f] bg-[#101011] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Projects</h1>
            <p className="text-gray-400 mt-1">Organize your work into focused areas</p>
          </div>
          <Button
            onClick={handleCreateProject}
            className="bg-[#22c55e] hover:bg-[#16a34a] text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Button>
        </div>

        {/* Search */}
        <div className="mt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-[#1f1f1f] border-[#2a2a2a] focus:border-[#22c55e] text-white placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Projects content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {filteredProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : searchQuery ? (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">No projects found</h3>
              <p className="text-gray-500">Try adjusting your search terms</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">No projects yet</h3>
              <p className="text-gray-500 mb-6">
                Projects help you organize your work into focused areas
              </p>
              <Button
                onClick={handleCreateProject}
                className="bg-[#22c55e] hover:bg-[#16a34a] text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create your first project
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 