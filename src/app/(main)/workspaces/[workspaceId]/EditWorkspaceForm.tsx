"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Workspace } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface EditWorkspaceFormProps {
  workspace: Workspace;
  onClose: () => void;
}

export default function EditWorkspaceForm({ workspace, onClose }: EditWorkspaceFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert spaces to dashes and keep only alphanumeric characters and dashes
    const slug = e.target.value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    
    setFormData((prev) => ({ ...prev, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.slug) {
      toast({
        title: "Error",
        description: "Name and slug are required fields",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          description: formData.description,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update workspace");
      }
      
      toast({
        title: "Success",
        description: "Workspace details updated successfully",
      });
      
      // Refresh data
      router.refresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-sm font-medium">Workspace Name</Label>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="My Workspace"
          className="text-sm"
          required
        />
      </div>
      
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label htmlFor="slug" className="text-sm font-medium">
            Workspace Slug
          </Label>
          <div className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded-md">
            Coming Soon
          </div>
        </div>
        <div className="flex items-center">
          <span className="bg-muted px-2.5 py-1.5 rounded-l border border-r-0 border-input text-muted-foreground text-sm">
            @
          </span>
          <Input
            id="slug"
            name="slug"
            className="rounded-l-none text-sm"
            value={formData.slug}
            placeholder="my-workspace"
            disabled
          />
        </div>
      </div>
      
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-sm font-medium">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Describe your workspace purpose (optional)"
          className="text-sm resize-none"
          rows={3}
        />
      </div>
      
      <div className="flex gap-2 justify-end pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isLoading}
          className="text-sm"
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isLoading} className="text-sm">
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
} 