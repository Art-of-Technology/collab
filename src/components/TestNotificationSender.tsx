"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function TestNotificationSender() {
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !message) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/test-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          message,
        }),
      });

      const data = await res.json();
      setResponse(data);

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Test notification sent successfully',
        });
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to send notification',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-6">
      <CardHeader>
        <CardTitle>Send Test Notification</CardTitle>
        <CardDescription>
          Send a direct notification to test if OneSignal is working properly
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userId">User ID</Label>
            <Input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter the user's database ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Notification Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your notification message"
              rows={3}
            />
          </div>

          {response && (
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-sm overflow-auto">
              <pre>{JSON.stringify(response, null, 2)}</pre>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Test Notification'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
} 