'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ConsentDialog } from '@/components/apps/ConsentDialog';
import { Download, Check, Settings } from 'lucide-react';
import { AppScope } from '@/lib/apps/types';

interface InstallButtonProps {
  app: {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string;
    publisherId: string;
  };
  scopes: AppScope[];
  permissions: {
    org: boolean;
    user: boolean;
  };
  workspaceId: string;
  workspaceSlug: string;
  isInstalled: boolean;
}

export function InstallButton({ app, scopes, permissions, workspaceId, workspaceSlug, isInstalled }: InstallButtonProps) {
  const [showConsent, setShowConsent] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');

  // Fetch workspace name
  useEffect(() => {
    async function fetchWorkspace() {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}`);
        if (response.ok) {
          const workspace = await response.json();
          setWorkspaceName(workspace.name || 'your workspace');
        }
      } catch (error) {
        console.error('Failed to fetch workspace:', error);
        setWorkspaceName('your workspace');
      }
    }
    fetchWorkspace();
  }, [workspaceId]);

  if (isInstalled) {
    return (
      <Button disabled className="gap-2">
        <Check className="w-4 h-4" />
        Installed
      </Button>
    );
  }

  return (
    <>
      <Button onClick={() => setShowConsent(true)} className="gap-2">
        <Download className="w-4 h-4" />
        Install App
      </Button>
      
        <ConsentDialog
          open={showConsent}
          onOpenChange={setShowConsent}
          app={app}
          scopes={scopes}
          permissions={permissions}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          workspaceName={workspaceName}
        />
    </>
  );
}
