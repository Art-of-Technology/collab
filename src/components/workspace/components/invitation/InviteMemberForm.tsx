'use client';

import React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Send, AlertCircle, CheckCircle } from 'lucide-react';
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
import { useInviteMember } from './hooks';

const inviteFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface InviteMemberFormProps {
  workspaceId: string;
  onInviteSent?: () => void;
}

export default function InviteMemberForm({ workspaceId, onInviteSent }: InviteMemberFormProps) {
  const inviteMutation = useInviteMember(workspaceId);
  
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: '',
    },
  });
  
  async function onSubmit(data: InviteFormValues) {
    try {
      await inviteMutation.mutateAsync(data.email);
      form.reset();
      
      if (onInviteSent) {
        onInviteSent();
      }
    } catch (error) {
      // Error is already handled by the mutation hook
      console.error('Invitation error:', error);
    }
  }
  
  return (
    <div>
      {inviteMutation.error && (
        <div className="bg-destructive/10 text-destructive text-xs p-2.5 rounded flex items-center mb-3">
          <AlertCircle className="h-3 w-3 mr-1.5" />
          {inviteMutation.error instanceof Error ? inviteMutation.error.message : 'An error occurred while sending the invitation'}
        </div>
      )}
      
      {inviteMutation.isSuccess && (
        <div className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs p-2.5 rounded flex items-center mb-3">
          <CheckCircle className="h-3 w-3 mr-1.5" />
          Invitation sent successfully!
        </div>
      )}
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Email Address</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="colleague@example.com" 
                    className="text-sm" 
                    {...field} 
                    disabled={inviteMutation.isPending} 
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Enter the email address of the person you want to invite.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <Button type="submit" disabled={inviteMutation.isPending} size="sm" className="w-full text-sm">
            {inviteMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Sending Invitation...
              </>
            ) : (
              <>
                <Send className="mr-1.5 h-3 w-3" />
                Send Invitation
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
