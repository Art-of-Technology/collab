'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { useToast } from '@/hooks/use-toast';

const inviteFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface InviteMemberFormProps {
  workspaceId: string;
  onInviteSent?: () => void;
}

export default function InviteMemberForm({ workspaceId, onInviteSent }: InviteMemberFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const router = useRouter();
  const { toast } = useToast();
  
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: '',
    },
  });
  
  async function onSubmit(data: InviteFormValues) {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }
      
      form.reset();
      setSuccessMessage(`Invitation sent to ${data.email}`);
      
      if (result.emailSent === false) {
        toast({
          title: "Invitation created, but email not sent",
          description: "The invitation was created successfully, but we couldn't send the email. The user can still join using the invitation link from your workspace settings.",
          variant: "default",
        });
      } else {
        toast({
          title: "Invitation sent successfully",
          description: `An email invitation has been sent to ${data.email}`,
          variant: "default",
        });
      }
      
      if (onInviteSent) {
        onInviteSent();
      }
      
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred while sending the invitation');
    } finally {
      setIsLoading(false);
    }
  }
  
  return (
    <div>
      {errorMessage && (
        <div className="bg-destructive/10 text-destructive text-xs p-2.5 rounded flex items-center mb-3">
          <AlertCircle className="h-3 w-3 mr-1.5" />
          {errorMessage}
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs p-2.5 rounded flex items-center mb-3">
          <CheckCircle className="h-3 w-3 mr-1.5" />
          {successMessage}
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
                    disabled={isLoading} 
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Enter the email address of the person you want to invite.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <Button type="submit" disabled={isLoading} size="sm" className="w-full text-sm">
            {isLoading ? (
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