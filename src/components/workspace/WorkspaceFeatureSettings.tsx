"use client";

import React from 'react';
import { Timer, Dock, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';

export function WorkspaceFeatureSettings() {
  const { settings, isLoading, isUpdating, updateSettings } = useWorkspaceSettings();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feature Settings</CardTitle>
          <CardDescription>
            Control which features are enabled in this workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
      <CardHeader>
        <CardTitle>Feature Settings</CardTitle>
        <CardDescription>
          Control which features are enabled in this workspace
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Time Tracking Setting */}
          <div className="flex items-center justify-between border border-border/40 p-4 rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-full">
                <Timer className="h-4 w-4 text-green-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Time Tracking</h3>
                <p className="text-sm text-muted-foreground">
                  Enable time tracking features including play/pause/stop buttons in task details
                </p>
              </div>
            </div>
            <Switch
              checked={settings?.timeTrackingEnabled ?? true}
              onCheckedChange={(checked) => updateSettings({ timeTrackingEnabled: checked })}
              disabled={isUpdating}
            />
          </div>

          {/* Dock Setting */}
          <div className="flex items-center justify-between border border-border/40 p-4 rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-full">
                <Dock className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Workspace Dock</h3>
                <p className="text-sm text-muted-foreground">
                  Enable the floating dock with quick access to features and shortcuts
                </p>
              </div>
            </div>
            <Switch
              checked={settings?.dockEnabled ?? true}
              onCheckedChange={(checked) => updateSettings({ dockEnabled: checked })}
              disabled={isUpdating}
            />
          </div>

          {/* Feature Independence Notice */}
          <div className="p-3 bg-muted/50 rounded-md border-l-4 border-blue-500">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> These features work independently. Time tracking can be used without the dock (accessible from task details), 
              and the dock can be enabled without time tracking (for shortcuts only).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 