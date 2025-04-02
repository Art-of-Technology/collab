"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Workspace } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Building2 } from 'lucide-react';

interface EditWorkspaceFormProps {
  workspace: Workspace;
}

export default function EditWorkspaceForm({ workspace }: EditWorkspaceFormProps) {
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace Name</Label>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="My Workspace"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="slug">
          Workspace Slug
          <span className="text-xs text-muted-foreground ml-2">
            (used in URLs)
          </span>
        </Label>
        <div className="flex items-center">
          <span className="bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input text-muted-foreground">
            @
          </span>
          <Input
            id="slug"
            name="slug"
            className="rounded-l-none"
            value={formData.slug}
            onChange={handleSlugChange}
            placeholder="my-workspace"
            required
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Describe your workspace purpose (optional)"
          rows={3}
        />
      </div>
      
      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.refresh()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
} 