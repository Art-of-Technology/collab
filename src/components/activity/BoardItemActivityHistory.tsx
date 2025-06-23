'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow, format } from 'date-fns';
import { BoardItemType } from '@/lib/board-item-activity-service';
import { 
  PlusCircle, 
  Edit3, 
  ArrowRightLeft, 
  AlertTriangle, 
  Clock,
  User,
  Calendar,
  Tag,
  Target,
  FileText,
  Palette,
  Move,
  Play,
  Pause,
  Square,
  ArrowRight
} from 'lucide-react';

interface Activity {
  id: string;
  action: string;
  details: any;
  createdAt: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    useCustomAvatar?: boolean;
    avatarSkinTone?: number;
    avatarEyes?: number;
    avatarBrows?: number;
    avatarMouth?: number;
    avatarNose?: number;
    avatarHair?: number;
    avatarEyewear?: number;
    avatarAccessory?: number;
  };
}

interface BoardItemActivityHistoryProps {
  itemType: BoardItemType;
  itemId: string;
  limit?: number;
  className?: string;
}

const getActionIcon = (action: string) => {
  switch (action) {
    case 'CREATED':
      return <PlusCircle className="h-4 w-4 text-green-500" />;
    case 'UPDATED':
    case 'TITLE_UPDATED':
    case 'DESCRIPTION_UPDATED':
      return <Edit3 className="h-4 w-4 text-blue-500" />;
    case 'MOVED':
    case 'COLUMN_CHANGED':
      return <Move className="h-4 w-4 text-purple-500" />;
    case 'STATUS_CHANGED':
      return <ArrowRightLeft className="h-4 w-4 text-indigo-500" />;
    case 'PRIORITY_CHANGED':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'ASSIGNED':
    case 'UNASSIGNED':
    case 'REPORTER_CHANGED':
      return <User className="h-4 w-4 text-cyan-500" />;
    case 'DUE_DATE_SET':
    case 'DUE_DATE_CHANGED':
    case 'DUE_DATE_REMOVED':
      return <Calendar className="h-4 w-4 text-rose-500" />;
    case 'LABELS_CHANGED':
      return <Tag className="h-4 w-4 text-yellow-500" />;
    case 'STORY_POINTS_CHANGED':
      return <Target className="h-4 w-4 text-emerald-500" />;
    case 'TYPE_CHANGED':
      return <FileText className="h-4 w-4 text-violet-500" />;
    case 'COLOR_CHANGED':
      return <Palette className="h-4 w-4 text-pink-500" />;
    case 'TASK_PLAY_STARTED':
      return <Play className="h-4 w-4 text-green-600" />;
    case 'TASK_PLAY_STOPPED':
      return <Square className="h-4 w-4 text-red-500" />;
    case 'TASK_PLAY_PAUSED':
      return <Pause className="h-4 w-4 text-yellow-600" />;
    case 'TIME_ADJUSTED':
      return <Clock className="h-4 w-4 text-blue-500" />;
    case 'SESSION_EDITED':
      return <Edit3 className="h-4 w-4 text-indigo-500" />;
    case 'HELP_REQUEST_SENT':
    case 'HELP_REQUEST_APPROVED':
    case 'HELP_REQUEST_REJECTED':
      return <User className="h-4 w-4 text-purple-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
};

const getActionColor = (action: string): string => {
  if (action.includes('CREATED')) return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
  if (action.includes('UPDATED') || action.includes('CHANGED')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
  if (action.includes('MOVED') || action.includes('COLUMN')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
  if (action.includes('ASSIGNED')) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
  if (action.includes('DELETED') || action.includes('REMOVED')) return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
  return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
};

const getActionDisplayName = (action: string): string => {
  const actionMap: Record<string, string> = {
    'CREATED': 'Created',
    'UPDATED': 'Updated',
    'MOVED': 'Moved',
    'ASSIGNED': 'Assigned',
    'UNASSIGNED': 'Unassigned',
    'STATUS_CHANGED': 'Status Changed',
    'PRIORITY_CHANGED': 'Priority Changed',
    'COLUMN_CHANGED': 'Column Changed',
    'DUE_DATE_SET': 'Due Date Set',
    'DUE_DATE_CHANGED': 'Due Date Changed',
    'DUE_DATE_REMOVED': 'Due Date Removed',
    'DESCRIPTION_UPDATED': 'Description Updated',
    'TITLE_UPDATED': 'Title Updated',
    'REPORTER_CHANGED': 'Reporter Changed',
    'LABELS_CHANGED': 'Labels Changed',
    'STORY_POINTS_CHANGED': 'Story Points Changed',
    'TYPE_CHANGED': 'Type Changed',
    'PARENT_CHANGED': 'Parent Changed',
    'EPIC_CHANGED': 'Epic Changed',
    'MILESTONE_CHANGED': 'Milestone Changed',
    'STORY_CHANGED': 'Story Changed',
    'COLOR_CHANGED': 'Color Changed',
    'TASK_PLAY_STARTED': 'Started Working',
    'TASK_PLAY_STOPPED': 'Stopped Working',
    'TASK_PLAY_PAUSED': 'Paused Work',
    'TIME_ADJUSTED': 'Time Adjusted',
    'SESSION_EDITED': 'Session Edited',
    'HELP_REQUEST_SENT': 'Help Request Sent',
    'HELP_REQUEST_APPROVED': 'Help Request Approved',
    'HELP_REQUEST_REJECTED': 'Help Request Rejected',
  };

  return actionMap[action] || action.replace(/_/g, ' ').toLowerCase();
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return 'None';
  
  try {
    // Try to parse JSON if it's a string
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') {
          // Handle common object formats
          if (parsed.name) return parsed.name;
          if (parsed.title) return parsed.title;
          if (parsed.label) return parsed.label;
          return JSON.stringify(parsed);
        }
        return String(parsed);
      } catch {
        // If it looks like a database ID (starts with 'cm' and is long), 
        // it's probably a column ID that should be hidden or replaced
        if (value.startsWith('cm') && value.length > 20) {
          return 'Unknown';
        }
        return value;
      }
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    // Handle objects
    if (typeof value === 'object') {
      if (value.name) return value.name;
      if (value.title) return value.title;
      if (value.label) return value.label;
      return JSON.stringify(value);
    }
    
    return String(value);
  } catch {
    return String(value);
  }
};

const getActionText = (activity: Activity): string => {
  const userName = activity.user.name || 'Unknown User';
  const actionName = getActionDisplayName(activity.action).toLowerCase();
  
  return `${userName} ${actionName} this ${activity.details?.itemType?.toLowerCase() || 'item'}`;
};

const getActionBadgeVariant = (action: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (action) {
    case 'CREATED':
      return 'default';
    case 'UPDATED':
    case 'TITLE_UPDATED':
    case 'DESCRIPTION_UPDATED':
      return 'secondary';
    case 'STATUS_CHANGED':
    case 'PRIORITY_CHANGED':
    case 'COLUMN_CHANGED':
    case 'TYPE_CHANGED':
      return 'outline';
    case 'ASSIGNED':
    case 'UNASSIGNED':
      return 'default';
    case 'DELETED':
    case 'DUE_DATE_REMOVED':
      return 'destructive';
    default:
      return 'outline';
  }
};

const shouldShowChangeDetails = (activity: Activity): boolean => {
  const { action, oldValue, newValue } = activity;
  
  // Show change details for field changes that have old and new values
  const changeActions = [
    'TITLE_UPDATED',
    'DESCRIPTION_UPDATED', 
    'STATUS_CHANGED',
    'PRIORITY_CHANGED',
    'COLUMN_CHANGED',
    'TYPE_CHANGED',
    'LABELS_CHANGED',
    'STORY_POINTS_CHANGED',
    'DUE_DATE_CHANGED',
    'REPORTER_CHANGED',
    'ASSIGNED',
    'COLOR_CHANGED',
    'TIME_ADJUSTED',
    'SESSION_EDITED'
  ];
  
  return changeActions.includes(action) && (oldValue !== undefined || newValue !== undefined || activity.details);
};

export default function BoardItemActivityHistory({
  itemType,
  itemId,
  limit = 50,
  className = '',
}: BoardItemActivityHistoryProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/board-items/${itemType.toLowerCase()}/${itemId}/activities?limit=${limit}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch activities: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Filter out redundant COLUMN_CHANGED activities
        const filteredActivities = data.filter((activity: Activity, index: number) => {
          // If this is a COLUMN_CHANGED activity, check if there's a STATUS_CHANGED activity nearby
          if (activity.action === 'COLUMN_CHANGED') {
            const fiveMinutesInMs = 5 * 60 * 1000;
            const activityTime = new Date(activity.createdAt).getTime();
            
            // Check for STATUS_CHANGED activities within 5 minutes
            const hasNearbyStatusChange = data.some((other: Activity, otherIndex: number) => {
              if (other.action === 'STATUS_CHANGED' && otherIndex !== index) {
                const otherTime = new Date(other.createdAt).getTime();
                return Math.abs(activityTime - otherTime) <= fiveMinutesInMs;
              }
              return false;
            });
            
            // Hide COLUMN_CHANGED if there's a nearby STATUS_CHANGED
            return !hasNearbyStatusChange;
          }
          
          return true;
        });
        
        setActivities(filteredActivities);
      } catch (err) {
        console.error('Error fetching activities:', err);
        setError(err instanceof Error ? err.message : 'Failed to load activities');
      } finally {
        setLoading(false);
      }
    };

    if (itemId && itemType) {
      fetchActivities();
    }
  }, [itemType, itemId, limit]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start space-x-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-red-600 mb-2">Failed to load activity history</p>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Activity History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-500">No activity history available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Activity History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div key={activity.id}>
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={activity.user.image || undefined} alt={activity.user.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {activity.user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getActionIcon(activity.action)}
                    <span className="text-sm font-medium">
                      {getActionText(activity)}
                    </span>
                    <Badge 
                      variant={getActionBadgeVariant(activity.action)} 
                      className={`text-xs ${getActionColor(activity.action)}`}
                    >
                      {getActionDisplayName(activity.action)}
                    </Badge>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <span>{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                      <span className="text-xs opacity-75">
                        {format(new Date(activity.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                      </span>
                    </div>
                  </div>
                  
                  {/* Show change details for field changes */}
                  {shouldShowChangeDetails(activity) && (
                    <div className="mt-2 p-3 bg-muted/50 dark:bg-muted/20 rounded-md text-xs border border-border/50">
                      <div className="font-medium mb-2 text-foreground">Change Details:</div>
                      <div className="space-y-1">
                        {activity.oldValue !== undefined && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="text-red-600 dark:text-red-400 font-medium">From:</span>
                            <span className="line-through opacity-75">
                              {activity.action === 'COLUMN_CHANGED' && activity.details?.fromColumn?.name 
                                ? activity.details.fromColumn.name 
                                : formatValue(activity.oldValue)}
                            </span>
                          </div>
                        )}
                        {activity.newValue !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-green-600 dark:text-green-400 font-medium">To:</span>
                            <span className="font-medium text-foreground">
                              {activity.action === 'COLUMN_CHANGED' && activity.details?.toColumn?.name 
                                ? activity.details.toColumn.name 
                                : formatValue(activity.newValue)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Show special details for certain actions */}
                  {activity.action === 'MOVED' && activity.details?.fromColumn && activity.details?.toColumn && (
                    <div className="mt-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-md text-xs border border-purple-200 dark:border-purple-800">
                      <div className="font-medium mb-1 text-purple-800 dark:text-purple-400">Movement Details:</div>
                      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                        <span className="font-medium">{activity.details.fromColumn.name}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium">{activity.details.toColumn.name}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Show special details for time adjustments */}
                  {activity.action === 'TIME_ADJUSTED' && activity.details && (
                    <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-xs border border-blue-200 dark:border-blue-800">
                      <div className="font-medium mb-2 text-blue-800 dark:text-blue-400">Time Adjustment:</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                          <span className="text-red-600 dark:text-red-400 font-medium">From:</span>
                          <span className="line-through opacity-75">{activity.details.originalFormatted || activity.details.original}</span>
                        </div>
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                          <span className="text-green-600 dark:text-green-400 font-medium">To:</span>
                          <span className="font-medium">{activity.details.newFormatted || activity.details.new}</span>
                        </div>
                        {activity.details.reason && (
                          <div className="pt-1 border-t border-blue-200 dark:border-blue-700">
                            <div className="font-medium text-blue-800 dark:text-blue-400">Reason:</div>
                            <div className="italic text-blue-700 dark:text-blue-300">&quot;{activity.details.reason}&quot;</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Show special details for session edits */}
                  {activity.action === 'SESSION_EDITED' && activity.details?.oldValue && activity.details?.newValue && (
                    <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-md text-xs border border-indigo-200 dark:border-indigo-800">
                      <div className="font-medium mb-2 text-indigo-800 dark:text-indigo-400">Session Changes:</div>
                      {(() => {
                        try {
                          const oldData = JSON.parse(activity.details.oldValue);
                          const newData = JSON.parse(activity.details.newValue);
                          const changes = activity.details.changes;
                          
                          return (
                            <div className="space-y-2">
                              {changes?.startTimeChanged && (
                                <div>
                                  <div className="text-indigo-700 dark:text-indigo-300 font-medium">Start Time:</div>
                                  <div className="text-red-600 dark:text-red-400 line-through">
                                    {new Date(oldData.startTime).toLocaleString()}
                                  </div>
                                  <div className="text-green-600 dark:text-green-400 font-medium">
                                    {new Date(newData.startTime).toLocaleString()}
                                  </div>
                                </div>
                              )}
                              
                              {changes?.endTimeChanged && (
                                <div>
                                  <div className="text-indigo-700 dark:text-indigo-300 font-medium">End Time:</div>
                                  <div className="text-red-600 dark:text-red-400 line-through">
                                    {new Date(oldData.endTime).toLocaleString()}
                                  </div>
                                  <div className="text-green-600 dark:text-green-400 font-medium">
                                    {new Date(newData.endTime).toLocaleString()}
                                  </div>
                                </div>
                              )}
                              
                              <div>
                                <div className="text-indigo-700 dark:text-indigo-300 font-medium">Duration:</div>
                                <div className="text-red-600 dark:text-red-400 line-through">
                                  {oldData.duration}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-green-600 dark:text-green-400 font-medium">{newData.duration}</span>
                                  {changes?.durationChange && (
                                    <Badge 
                                      variant={changes.durationChange.isIncrease ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {changes.durationChange.formatted}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              {activity.details.reason && (
                                <div className="pt-1 border-t border-indigo-200 dark:border-indigo-700">
                                  <div className="text-indigo-800 dark:text-indigo-400 font-medium">Reason:</div>
                                  <div className="text-indigo-700 dark:text-indigo-300 italic">
                                    &quot;{activity.details.reason}&quot;
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        } catch {
                          return (
                            <div className="text-indigo-600 dark:text-indigo-400">
                              Unable to display session changes
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>
              
              {index < activities.length - 1 && (
                <Separator className="mt-4" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 