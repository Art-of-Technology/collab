'use client';

import { useState, useEffect } from 'react';
import { Session } from 'next-auth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building, Users, ArrowRight } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  memberCount?: number;
}

// Legacy interface for backward compatibility
interface LegacyWorkspaceSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorkspaceSelected: (workspaceSlug: string) => void;
  app: {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string;
    publisherId: string;
  };
}

// New interface for global app discovery
interface GlobalWorkspaceSelectorProps {
  onWorkspaceSelected: (workspaceId: string, workspaceSlug: string) => void;
  userSession: Session | null;
}

type WorkspaceSelectorProps = LegacyWorkspaceSelectorProps | GlobalWorkspaceSelectorProps;

function isLegacyProps(props: WorkspaceSelectorProps): props is LegacyWorkspaceSelectorProps {
  return 'open' in props;
}

export function WorkspaceSelector(props: WorkspaceSelectorProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLegacyProps(props)) {
      if (props.open) {
        fetchWorkspaces();
      }
    } else {
      // For global app discovery, fetch workspaces immediately
      fetchWorkspaces();
    }
  }, [isLegacyProps(props) && props.open]);

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/workspaces');
      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data);
      }
    } catch (error) {
      console.error('Failed to fetch workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorkspace = (workspace: Workspace) => {
    if (isLegacyProps(props)) {
      props.onWorkspaceSelected(workspace.slug);
      props.onOpenChange(false);
    } else {
      props.onWorkspaceSelected(workspace.id, workspace.slug);
    }
  };

  // For legacy (dialog) mode
  if (isLegacyProps(props)) {
    return (
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Workspace</DialogTitle>
            <DialogDescription>
              Select the workspace where you want to install <strong>{props.app.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-60 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Loading workspaces...</div>
              </div>
            ) : workspaces.length > 0 ? (
              workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleSelectWorkspace(workspace)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Building className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{workspace.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {workspace.memberCount ? (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {workspace.memberCount} members
                          </span>
                        ) : (
                          workspace.slug
                        )}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">
                    No workspaces found
                  </div>
                  <div className="text-xs text-muted-foreground">
                    You need to be a member of a workspace to install apps
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // For global app discovery (inline) mode
  return (
    <div className="space-y-3 max-h-60 overflow-y-auto">
      <div className="text-sm font-medium">Select Workspace:</div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-muted-foreground">Loading workspaces...</div>
        </div>
      ) : workspaces.length > 0 ? (
        workspaces.map((workspace) => (
          <div
            key={workspace.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => handleSelectWorkspace(workspace)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Building className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="font-medium text-sm">{workspace.name}</div>
                <div className="text-xs text-muted-foreground">
                  {workspace.memberCount ? (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {workspace.memberCount} members
                    </span>
                  ) : (
                    workspace.slug
                  )}
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
        ))
      ) : (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-2">
              No workspaces found
            </div>
            <div className="text-xs text-muted-foreground">
              You need to be a member of a workspace to install apps
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspaceSelector;
