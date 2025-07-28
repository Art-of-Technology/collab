"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateProject } from '@/hooks/queries/useProject';
import { Loader2 } from 'lucide-react';

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

export function EditProjectDialog({ 
  open, 
  onOpenChange, 
  project 
}: EditProjectDialogProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  
  const updateProjectMutation = useUpdateProject();

  // Reset form when project changes
  useEffect(() => {
    setName(project.name);
    setDescription(project.description || '');
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) return;
    
    try {
      await updateProjectMutation.mutateAsync({
        projectId: project.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
        },
      });
      
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form to original values
      setName(project.name);
      setDescription(project.description || '');
    }
    onOpenChange(open);
  };

  const hasChanges = name !== project.name || description !== (project.description || '');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update the project details.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="Enter project name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={updateProjectMutation.isPending}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Enter project description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={updateProjectMutation.isPending}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={updateProjectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !hasChanges || updateProjectMutation.isPending}
            >
              {updateProjectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}