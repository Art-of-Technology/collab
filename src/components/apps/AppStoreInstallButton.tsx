'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ExternalLink, Settings } from 'lucide-react';
import { AppScope } from '@/lib/apps/types';
import { WorkspaceSelector } from './WorkspaceSelector';

interface AppStoreInstallButtonProps {
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
}

export function AppStoreInstallButton({ app, scopes, permissions }: AppStoreInstallButtonProps) {
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const router = useRouter();

  const handleInstall = () => {
    setShowWorkspaceSelector(true);
  };

  const handleWorkspaceSelected = (workspaceSlug: string) => {
    // Navigate to the workspace-specific app page for installation
    router.push(`/${workspaceSlug}/apps/${app.slug}`);
  };

  return (
    <>
      <Button onClick={handleInstall} className="gap-2">
        <Download className="w-4 h-4" />
        Install App
      </Button>

      <WorkspaceSelector
        open={showWorkspaceSelector}
        onOpenChange={setShowWorkspaceSelector}
        onWorkspaceSelected={handleWorkspaceSelected}
        app={app}
      />
    </>
  );
}
