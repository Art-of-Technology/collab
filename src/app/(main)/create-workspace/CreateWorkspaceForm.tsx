'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateWorkspace } from '@/hooks/queries/useWorkspace';

const workspaceFormSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name cannot exceed 50 characters'),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(30, 'Slug cannot exceed 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .refine(val => !val.startsWith('-') && !val.endsWith('-'), 'Slug cannot start or end with a hyphen'),
  description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
  logoUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;

export function CreateWorkspaceForm() {
  const router = useRouter();
  const { toast } = useToast();
  const createWorkspaceMutation = useCreateWorkspace();
  
  const form = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      logoUrl: '',
    },
  });
  
  // Auto-generate slug from name
  const watchName = form.watch('name');
  React.useEffect(() => {
    if (watchName && !form.getValues('slug')) {
      const generatedSlug = watchName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-');
      
      form.setValue('slug', generatedSlug, { shouldValidate: true });
    }
  }, [watchName, form]);
  
  async function onSubmit(data: WorkspaceFormValues) {
    try {
      const workspace = await createWorkspaceMutation.mutateAsync(data);
      
      toast({
        title: "Success",
        description: "Workspace created successfully!"
      });
      
      router.push(`/workspaces/${workspace.id}`);
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to create workspace',
        variant: "destructive"
      });
    }
  }
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace Name *</FormLabel>
              <FormControl>
                <Input placeholder="My Team" {...field} />
              </FormControl>
              <FormDescription>
                This is the name that will be displayed for your workspace.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace Slug *</FormLabel>
              <FormControl>
                <Input placeholder="my-team" {...field} />
              </FormControl>
              <FormDescription>
                This will be used in URLs. Only lowercase letters, numbers, and hyphens are allowed.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="A brief description of your workspace" 
                  {...field} 
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                Describe the purpose of your workspace.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="logoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logo URL</FormLabel>
              <FormControl>
                <Input 
                  placeholder="https://example.com/logo.png" 
                  {...field} 
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                Provide a URL to your workspace logo (optional).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="pt-4">
          <Button 
            type="submit" 
            disabled={createWorkspaceMutation.isPending} 
            className="w-full"
          >
            {createWorkspaceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Workspace...
              </>
            ) : (
              <>
                <Building2 className="mr-2 h-4 w-4" />
                Create Workspace
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
} 