"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Bell,
  BellOff,
  CheckSquare,
  MessageSquare,
  AlertTriangle,
  Calendar,
  Mail,
  RotateCcw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Smartphone,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useResetNotificationPreferences,
  type NotificationPreferenceUpdate
} from "@/hooks/queries/useNotificationPreferences";
import { useWorkspace } from "@/context/WorkspaceContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useWorkspacePermissions } from "@/hooks/use-workspace-permissions";

interface NotificationSetting {
  key: keyof NotificationPreferenceUpdate;
  label: string;
  description: string;
  recommended?: boolean;
}

interface SettingGroup {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  parentToggle?: keyof NotificationPreferenceUpdate;
  settings: NotificationSetting[];
  children?: SettingGroup[];
}

const settingGroups: SettingGroup[] = [
  {
    id: "issues",
    title: "Issue Notifications",
    description: "Get notified about activities on issues you follow",
    icon: <CheckSquare className="h-5 w-5 text-blue-500" />,
    settings: [
      // Using taskUpdated and taskDeleted; 'taskCreated' not present in hook type
      {
        key: "taskUpdated",
        label: "General Updates",
        description: "When issue details or status are updated",
        recommended: true,
      },
      {
        key: "taskDeleted",
        label: "Issue Deleted",
        description: "When issues are deleted",
      },
    ],
  },
  {
    id: "projects",
    title: "Project Notifications",
    description: "Get notified about activities on projects you follow (project-level notifications only)",
    icon: <Calendar className="h-5 w-5 text-purple-500" />,
    settings: [
      {
        key: "boardTaskCreated",
        label: "New Issues",
        description: "When new issues are created in projects you follow",
        recommended: true,
      },
      {
        key: "boardTaskStatusChanged",
        label: "Status Changes",
        description: "When issue statuses change in projects you follow",
        recommended: true,
      },
      {
        key: "boardTaskDeleted",
        label: "Issues Deleted",
        description: "When issues are deleted in projects you follow",
        recommended: true,
      },
    ],
  },
  {
    id: "email",
    title: "Email Notifications",
    description: "Control email delivery of notifications",
    icon: <Mail className="h-5 w-5 text-orange-500" />,
    settings: [
      {
        key: "emailNotificationsEnabled",
        label: "Email Delivery",
        description: "Receive notifications via email (in addition to in-app)",
      },
    ],
  },
  {
    id: "push",
    title: "Push Notifications",
    description: "Receive real-time notifications in your browser",
    icon: <Smartphone className="h-5 w-5 text-indigo-500" />,
    settings: [
      {
        key: "pushNotificationsEnabled",
        label: "Browser Push Notifications",
        description: "Get instant notifications even when the app is not open",
        recommended: true,
      },
    ],
  },
  {
    id: "leave",
    title: "Leave Request Notifications",
    description:
      "Get notified about leave request activities and status changes",
    icon: <Users className="h-5 w-5 text-green-500" />,
    settings: [
      {
        key: "leaveRequestStatusChanged",
        label: "Status Updates",
        description: "When your leave request is approved, rejected, or cancelled",
        recommended: true,
      },
      {
        key: "leaveRequestEdited",
        label: "Request Edited",
        description: "When your leave request is edited",
        recommended: true,
      },
      {
        key: "leaveRequestManagerAlert",
        label: "Manager Alerts",
        description:
          "When you need to review team leave requests (if you're a manager)",
        recommended: true,
      },
      {
        key: "leaveRequestHRAlert",
        label: "HR Alerts",
        description:
          "When special leave requests require HR attention (parental, medical, etc.)",
        recommended: false,
      },
    ],
  },
];

export default function NotificationSettings() {
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const { data: preferences, isLoading } = useNotificationPreferences(workspaceId);
  const updateMutation = useUpdateNotificationPreferences(workspaceId);
  const resetMutation = useResetNotificationPreferences(workspaceId);
  const [openSections, setOpenSections] = useState<string[]>(["issues", "projects", "leave"]);
  const {
    isSupported: isPushSupported,
    isSubscribed: isPushSubscribed,
    isLoading: isPushLoading,
    toggleSubscription: togglePushSubscription,
  } = usePushNotifications();
  const { canManageLeave } = useWorkspacePermissions();

  const handleToggle = async (key: keyof NotificationPreferenceUpdate, value: boolean) => {
    // Handle push notifications specially
    if (key === "pushNotificationsEnabled") {
      if (value && !isPushSubscribed) {
        // Enable push notifications - this will handle the subscription
        await togglePushSubscription();
      } else if (!value && isPushSubscribed) {
        // Disable push notifications
        await togglePushSubscription();
      }
      return;
    }

    // Handle other settings normally
    try {
      await updateMutation.mutateAsync({ [key]: value });
      toast({
        title: "Settings Updated",
        description: "Your notification preferences have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update notification preferences. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync();
      toast({
        title: "Settings Reset",
        description: "Your notification preferences have been reset to defaults.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset notification preferences. Please try again.",
        variant: "destructive",
      });
    }
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const getGroupEnabledCount = (group: SettingGroup) => {
    if (!preferences) return 0;
    return group.settings.filter(setting => preferences[setting.key]).length;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!preferences) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load preferences</h3>
          <p className="text-muted-foreground">Please refresh the page to try again.</p>
        </CardContent>
      </Card>
    );
  }

  // Filter settings based on permissions
  const filteredSettingGroups = settingGroups.map(group => {
    if (group.id === "leave") {
      // Filter out manager/HR settings if user doesn't have permission
      const filteredSettings = group.settings.filter(setting => {
        if (setting.key === "leaveRequestManagerAlert" || setting.key === "leaveRequestHRAlert") {
          return canManageLeave;
        }
        return true;
      });
      
      return {
        ...group,
        settings: filteredSettings
      };
    }
    return group;
  });

  const totalEnabled = filteredSettingGroups.reduce((sum, group) => sum + getGroupEnabledCount(group), 0);
  const totalSettings = filteredSettingGroups.reduce((sum, group) => sum + group.settings.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Notification Settings</h2>
          <p className="text-muted-foreground">
            Customize when and how you receive notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Bell className="h-3 w-3" />
            {totalEnabled}/{totalSettings} enabled
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={resetMutation.isPending}
            className="gap-2"
          >
            {resetMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reset Defaults
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredSettingGroups.map((group) => {
          const isOpen = openSections.includes(group.id);
          const enabledCount = getGroupEnabledCount(group);

          return (
            <Card key={group.id} className="border-border/50">
              <Collapsible open={isOpen} onOpenChange={() => toggleSection(group.id)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {group.icon}
                        <div>
                          <CardTitle className="text-base">{group.title}</CardTitle>
                          <CardDescription className="text-sm">{group.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {enabledCount}/{group.settings.length}
                        </Badge>
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {group.settings.map((setting, settingIndex) => (
                        <div key={setting.key} className="flex items-start justify-between gap-2 sm:gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={setting.key}
                                className="text-sm font-medium leading-none cursor-pointer"
                              >
                                {setting.label}
                              </label>
                              {setting.recommended && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {setting.description}
                              {setting.key === "pushNotificationsEnabled" && !isPushSupported && (
                                <span className="block text-amber-600 dark:text-amber-400 mt-1">
                                  Push notifications are not supported in your browser
                                </span>
                              )}
                              {setting.key === "pushNotificationsEnabled" && isPushSupported && isPushSubscribed && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2"
                                  onClick={async () => {
                                    try {
                                      const response = await fetch('/api/notifications/push/test', {
                                        method: 'POST',
                                      });
                                      const data = await response.json();
                                      if (response.ok) {
                                        toast({
                                          title: "Test Sent",
                                          description: "Check your notifications!",
                                        });
                                      } else {
                                        throw new Error(data.error);
                                      }
                                    } catch (error) {
                                      toast({
                                        title: "Test Failed",
                                        description: "Could not send test notification",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  Send Test Notification
                                </Button>
                              )}
                            </p>
                          </div>
                          <div className="flex justify-end">
                            {setting.key === "pushNotificationsEnabled" ? (
                              <Switch
                                id={setting.key}
                                checked={isPushSubscribed}
                                onCheckedChange={(checked) => handleToggle(setting.key, checked)}
                                disabled={isPushLoading || !isPushSupported}
                                className="mt-1"
                              />
                            ) : (
                              <Switch
                                id={setting.key}
                                checked={preferences[setting.key] || false}
                                onCheckedChange={(checked) => handleToggle(setting.key, checked)}
                                disabled={updateMutation.isPending}
                                className="mt-1"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Issue vs Project Notifications
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                <strong>Issue notifications</strong> apply when you follow individual issues.
                <strong>Project notifications</strong> apply when you follow entire projects and generally notify for key status changes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}