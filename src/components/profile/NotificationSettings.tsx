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
    id: "tasks",
    title: "Task Notifications",
    description: "Get notified about individual task activities (when following tasks)",
    icon: <CheckSquare className="h-5 w-5 text-blue-500" />,
    settings: [
      {
        key: "taskStatusChanged",
        label: "Status Changes",
        description: "When task status changes (To Do → In Progress, etc.)",
        recommended: true,
      },
      {
        key: "taskAssigned",
        label: "Task Assigned",
        description: "When you are assigned to a task",
        recommended: true,
      },
      {
        key: "taskDeleted",
        label: "Task Deleted",
        description: "When tasks are deleted",
        recommended: true,
      },
      {
        key: "taskCommentAdded",
        label: "Comments",
        description: "When someone comments on tasks you follow",
      },
      {
        key: "taskPriorityChanged",
        label: "Priority Changes",
        description: "When task priority is updated",
      },
      {
        key: "taskDueDateChanged",
        label: "Due Date Changes",
        description: "When task due dates are modified",
      },
      {
        key: "taskUpdated",
        label: "General Updates",
        description: "When task details are updated",
      },
    ],
  },
  {
    id: "boards",
    title: "Board Notifications",
    description: "Get notified about activities on boards you follow (board-level notifications only)",
    icon: <Calendar className="h-5 w-5 text-purple-500" />,
    settings: [
      {
        key: "boardTaskCreated",
        label: "New Tasks",
        description: "When new tasks are created on boards you follow",
        recommended: true,
      },
      {
        key: "boardTaskStatusChanged",
        label: "Status Changes",
        description: "When task statuses change on boards you follow",
        recommended: true,
      },
      {
        key: "boardTaskCompleted",
        label: "Tasks Completed",
        description: "When tasks are marked as completed on boards you follow",
        recommended: true,
      },
      {
        key: "boardTaskDeleted",
        label: "Tasks Deleted",
        description: "When tasks are deleted from boards you follow",
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
  const { data: preferences, isLoading } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();
  const resetMutation = useResetNotificationPreferences();
  const [openSections, setOpenSections] = useState<string[]>(["tasks", "boards", "leave"]);
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
                        <div key={setting.key} className="grid grid-cols-[1fr_auto] items-start gap-2 sm:gap-4">
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
                Task vs Board Notifications
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                <strong>Task notifications</strong> apply when you follow individual tasks.
                <strong>Board notifications</strong> apply when you follow entire boards and only notify for task status changes.
                Column moves are disabled by default due to frequency.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}