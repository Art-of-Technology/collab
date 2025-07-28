"use client";

import { useProjects } from '@/hooks/queries/useProject';
import { useWorkspace } from '@/context/WorkspaceContext';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { FolderOpen } from 'lucide-react';

interface ProjectSelectProps {
  value?: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ProjectSelect({ 
  value, 
  onValueChange, 
  disabled = false,
  placeholder = "Select project..." 
}: ProjectSelectProps) {
  const { currentWorkspace } = useWorkspace();
  const { data: projects, isLoading } = useProjects(currentWorkspace?.id || '');

  const handleValueChange = (selectedValue: string) => {
    if (selectedValue === 'none') {
      onValueChange(null);
    } else {
      onValueChange(selectedValue);
    }
  };

  return (
    <Select
      value={value || 'none'}
      onValueChange={handleValueChange}
      disabled={disabled || isLoading || !currentWorkspace}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <div className="flex items-center">
            <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
            No Project
          </div>
        </SelectItem>
        {projects?.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <div className="flex items-center">
              <FolderOpen className="mr-2 h-4 w-4 text-blue-600" />
              <span>{project.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}