'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
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
});

type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;

interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceModal({ open, onOpenChange }: CreateWorkspaceModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createWorkspaceMutation = useCreateWorkspace();
  
  const form = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });
  
  async function onSubmit(data: WorkspaceFormValues) {
    try {
      const workspace = await createWorkspaceMutation.mutateAsync({
        name: data.name,
        description: data.description,
        // Slug will be generated automatically on the backend
      });
      
      // Invalidate workspace queries to refresh workspaces everywhere
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      
      toast({
        title: "Success",
        description: "Workspace created successfully!"
      });
      
      // Close modal and navigate to the new workspace
      onOpenChange(false);
      form.reset();
      
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

  const handleClose = () => {
    onOpenChange(false);
    form.reset();
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-[#101011] border-[#30363d] text-[#e6edf3]">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-[#e6edf3] flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#8b949e]" />
              Create Workspace
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 w-8 p-0 text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-[#e6edf3] text-sm font-medium">Workspace Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="My Team" 
                      {...field} 
                      className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder-[#6e7681] focus:border-[#58a6ff] hover:border-[#444c56] transition-colors"
                      autoFocus
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
                <FormItem className="space-y-2">
                  <FormLabel className="text-[#e6edf3] text-sm font-medium">Description <span className="text-[#6e7681] font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="A brief description of your workspace" 
                      {...field} 
                      value={field.value || ''}
                      className="bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder-[#6e7681] focus:border-[#58a6ff] hover:border-[#444c56] transition-colors resize-none min-h-[80px]"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage className="text-[#f85149] text-xs" />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button"
                variant="ghost"
                onClick={handleClose}
                className="text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createWorkspaceMutation.isPending} 
                className="bg-[#238636] hover:bg-[#2ea043] text-white border-0 disabled:opacity-50"
              >
                {createWorkspaceMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
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
      </DialogContent>
    </Dialog>
  );
}
