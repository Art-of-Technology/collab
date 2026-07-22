'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, AlertTriangle } from 'lucide-react';
import { AppScope } from '@/lib/apps/types';
import { installApp } from '@/actions/appInstallation';
import { SCOPE_DESCRIPTIONS } from './constants';

interface ConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  workspaceName: string;
}



function getScopeLevel(scope: AppScope): 'low' | 'medium' | 'high' {
  return SCOPE_DESCRIPTIONS[scope]?.level || 'medium';
}

function getScopeBadgeColor(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'low': return 'bg-green-100 text-green-800 border-green-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
  }
}

export function ConsentDialog({ 
  open, 
  onOpenChange, 
  app, 
  scopes, 
  permissions,
  workspaceId, 
  workspaceSlug, 
  workspaceName 
}: ConsentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);

  const highRiskScopes = scopes.filter(scope => getScopeLevel(scope) === 'high');
  const hasHighRiskScopes = highRiskScopes.length > 0;

  const handleInstall = async () => {
    if (hasHighRiskScopes && !understood) {
      setError('Please confirm that you understand the permissions being granted.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('appSlug', app.slug);
      formData.append('workspaceId', workspaceId);
      formData.append('scopes', JSON.stringify(scopes));

      const installResult = await installApp(formData);

      if (installResult.success && installResult.installationId) {
        // Get the app's OAuth client details to construct proper OAuth URL
        const appResponse = await fetch(`/api/apps/${app.slug}`);
        if (!appResponse.ok) {
          throw new Error('Failed to get app OAuth details');
        }
        
        const appData = await appResponse.json();
        if (!appData.oauthClient) {
          throw new Error('App does not support OAuth installation');
        }

        // Construct proper OAuth authorization URL
        const oauthParams = new URLSearchParams({
          client_id: appData.oauthClient.clientId,
          redirect_uri: appData.oauthClient.redirectUris[0],
          scope: scopes.join(' '),
          response_type: 'code',
          state: crypto.randomUUID(), // Generate random state for security
          installation_id: installResult.installationId,
          workspace_id: workspaceId
        });

        window.location.href = `/api/oauth/authorize?${oauthParams.toString()}`;
      } else {
        throw new Error('Installation failed');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to install app';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {app.iconUrl ? (
              <Image 
                src={app.iconUrl} 
                alt={`${app.name} icon`}
                width={48}
                height={48}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <DialogTitle className="text-xl">Install {app.name}?</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Published by {app.publisherId}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              This app is requesting permission to access data in <strong>{workspaceName}</strong>. 
              Review the permissions below and click "Install" to continue.
            </p>
          </div>

          {/* Permissions List */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              API Scopes ({scopes.length})
            </h3>
            <div className="space-y-3">
              {scopes.map((scope) => {
                const scopeInfo = SCOPE_DESCRIPTIONS[scope];
                const level = getScopeLevel(scope);
                
                return (
                  <div key={scope} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {scopeInfo?.label || scope}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getScopeBadgeColor(level)}`}
                        >
                          {level} risk
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {scopeInfo?.description || 'Access to this resource'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Installation Permissions */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Installation Permissions
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">Organization Level</span>
                    <Badge variant={permissions.org ? "default" : "outline"} className="text-xs">
                      {permissions.org ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {permissions.org 
                      ? 'This app can be installed at the organization level and will have access to organization-wide data'
                      : 'This app cannot be installed at the organization level'
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">User Level</span>
                    <Badge variant={permissions.user ? "default" : "outline"} className="text-xs">
                      {permissions.user ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {permissions.user 
                      ? 'This app can be installed at the user level and will have access to user-specific data'
                      : 'This app cannot be installed at the user level'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* High Risk Warning */}
          {hasHighRiskScopes && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <div className="font-medium mb-2">High-risk permissions detected</div>
                <p className="text-sm mb-3">
                  This app can create and modify data on your behalf. Only install apps from trusted publishers.
                </p>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="understood"
                    checked={understood}
                    onCheckedChange={(checked) => setUnderstood(checked as boolean)}
                  />
                  <label
                    htmlFor="understood"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I understand the risks and trust this publisher
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* App Info */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• You can uninstall this app at any time from workspace settings</p>
            <p>• This app will only have access to the {workspaceName} workspace</p>
            <p>• Your data remains under your control</p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleInstall}
            disabled={loading || (hasHighRiskScopes && !understood)}
            className="w-full sm:w-auto"
          >
            {loading ? 'Installing...' : 'Install App'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
