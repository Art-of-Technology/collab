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
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useResetNotificationPreferences,
  type NotificationPreferenceUpdate
} from "@/hooks/queries/useNotificationPreferences";

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
    id: "posts",
    title: "Post Notifications",
    description: "Get notified about post and discussion activities",
    icon: <MessageSquare className="h-5 w-5 text-green-500" />,
    settings: [
      {
        key: "postCommentAdded",
        label: "Comments",
        description: "When someone comments on posts you follow",
      },
      {
        key: "postBlockerCreated",
        label: "Blocker Posts",
        description: "When someone creates a blocker post",
      },
      {
        key: "postResolved",
        label: "Posts Resolved",
        description: "When posts you follow are marked as resolved",
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
];

export default function NotificationSettings() {
  const { toast } = useToast();
  const { data: preferences, isLoading } = useNotificationPreferences();
  const updateMutation = useUpdateNotificationPreferences();
  const resetMutation = useResetNotificationPreferences();
  const [openSections, setOpenSections] = useState<string[]>(["tasks", "boards"]);

  const handleToggle = async (key: keyof NotificationPreferenceUpdate, value: boolean) => {
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

  const totalEnabled = settingGroups.reduce((sum, group) => sum + getGroupEnabledCount(group), 0);
  const totalSettings = settingGroups.reduce((sum, group) => sum + group.settings.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
        {settingGroups.map((group) => {
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
                        <div key={setting.key} className="flex items-start justify-between gap-4">
                          <div className="space-y-1 flex-1">
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
                            </p>
                          </div>
                          <Switch
                            id={setting.key}
                            checked={preferences[setting.key] || false}
                            onCheckedChange={(checked) => handleToggle(setting.key, checked)}
                            disabled={updateMutation.isPending}
                            className="mt-1"
                          />
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