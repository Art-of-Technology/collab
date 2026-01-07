'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SystemAppToggleProps {
  appId: string;
  appName: string;
  isSystemApp: boolean;
}

export function SystemAppToggle({ appId, appName, isSystemApp }: SystemAppToggleProps) {
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(isSystemApp);
  const { toast } = useToast();
  const router = useRouter();

  const handleToggle = async (newValue: boolean) => {
    setLoading(true);

    try {
      const response = await fetch(`/api/apps/by-id/${appId}/system-app`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isSystemApp: newValue }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update system app status');
      }

      setChecked(newValue);
      toast({
        title: newValue ? 'System App Enabled' : 'System App Disabled',
        description: data.message,
      });

      // Refresh the page data
      router.refresh();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update system app status',
        variant: 'destructive',
      });
      // Revert the switch on error
      setChecked(isSystemApp);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <Switch
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={loading}
        aria-label={`Toggle ${appName} as system app`}
      />
    </div>
  );
}
