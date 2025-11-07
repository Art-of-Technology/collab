'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
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
import { workspaceKeys } from '@/hooks/queries/useWorkspace';

const workspaceFormSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name cannot exceed 50 characters'),
  description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
  logoUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;

export function CreateWorkspaceForm() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createWorkspaceMutation = useCreateWorkspace();

  const form = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: {
      name: '',
      description: '',
      logoUrl: '',
    },
  });

  async function onSubmit(data: WorkspaceFormValues) {
    try {
      const workspace = await createWorkspaceMutation.mutateAsync(data);

      // Invalidate workspace queries to refresh workspaces everywhere
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });

      toast({
        title: "Success",
        description: "Workspace created successfully!"
      });

      // Navigate to workspace dashboard using slug if available, otherwise use ID
      const workspaceSlugOrId = workspace.slug || workspace.id;
      router.push(`/${workspaceSlugOrId}/dashboard`);
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel className="text-[#e6edf3] text-sm font-medium">Workspace Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="My Team"
                  {...field}
                  className="bg-transparent border-[#30363d] text-[#e6edf3] placeholder-[#6e7681] focus:border-[#58a6ff] hover:border-[#444c56] transition-colors h-8 text-sm"
                />
              </FormControl>
              <FormMessage className="text-[#f85149] text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel className="text-[#e6edf3] text-sm font-medium">Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="A brief description of your workspace"
                  {...field}
                  value={field.value || ''}
                  className="bg-transparent border-[#30363d] text-[#e6edf3] placeholder-[#6e7681] focus:border-[#58a6ff] hover:border-[#444c56] transition-colors resize-none text-sm min-h-[60px]"
                  rows={2}
                />
              </FormControl>
              <FormMessage className="text-[#f85149] text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="logoUrl"
          render={({ field }) => (
            <FormItem className="space-y-1.5">
              <FormLabel className="text-[#e6edf3] text-sm font-medium">Logo URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://example.com/logo.png"
                  {...field}
                  value={field.value || ''}
                  className="bg-transparent border-[#30363d] text-[#e6edf3] placeholder-[#6e7681] focus:border-[#58a6ff] hover:border-[#444c56] transition-colors h-8 text-sm"
                />
              </FormControl>
              <FormDescription className="text-[#6e7681] text-xs">
                Optional • Provide a URL to your workspace logo
              </FormDescription>
              <FormMessage className="text-[#f85149] text-xs" />
            </FormItem>
          )}
        />

        <div className="pt-6">
          <Button
            type="submit"
            disabled={createWorkspaceMutation.isPending}
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-0 h-8 px-3 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {createWorkspaceMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Building2 className="mr-2 h-3 w-3" />
                Create Workspace
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
} 