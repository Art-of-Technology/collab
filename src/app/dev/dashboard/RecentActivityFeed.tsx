'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, Download as DownloadIcon, XCircle, AlertCircle, CheckCircle, Filter } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export type ActivityType = 'installation' | 'webhook_failure' | 'status_change';
export type ActivityFilter = ActivityType | 'all';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string; // ISO string from server
  appName?: string;
  appSlug?: string;
  status?: string;
}

interface RecentActivityFeedProps {
  activities: Activity[];
}

export default function RecentActivityFeed({ activities }: RecentActivityFeedProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const filteredActivities = useMemo(() => {
    if (filter === 'all') {
      return activities;
    }
    return activities.filter(activity => activity.type === filter);
  }, [activities, filter]);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
            <Select value={filter} onValueChange={(value) => setFilter(value as ActivityFilter)}>
            <SelectTrigger className="w-32 sm:w-40 h-8 text-xs">
              <Filter className="h-3 w-3 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="installation">Installations</SelectItem>
              <SelectItem value="webhook_failure">Webhook Failures</SelectItem>
              <SelectItem value="status_change">Status Changes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {filter === 'all' ? 'No recent activity' : `No ${filter.replace('_', ' ')} activities`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActivities.map((activity) => {
              let icon = Activity;
              let iconColor = 'text-gray-400';
              let bgColor = 'bg-gray-500/10';
              
              if (activity.type === 'installation') {
                icon = DownloadIcon;
                iconColor = 'text-blue-400';
                bgColor = 'bg-blue-500/10';
              } else if (activity.type === 'webhook_failure') {
                icon = XCircle;
                iconColor = 'text-red-400';
                bgColor = 'bg-red-500/10';
              } else if (activity.type === 'status_change') {
                if (activity.status === 'PUBLISHED') {
                  icon = CheckCircle;
                  iconColor = 'text-green-400';
                  bgColor = 'bg-green-500/10';
                } else if (activity.status === 'REJECTED') {
                  icon = XCircle;
                  iconColor = 'text-red-400';
                  bgColor = 'bg-red-500/10';
                } else {
                  icon = AlertCircle;
                  iconColor = 'text-amber-400';
                  bgColor = 'bg-amber-500/10';
                }
              }
              
              const Icon = icon;
              
              return (
                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-card/30 hover:bg-card/50 transition-colors">
                  <div className={`p-2 ${bgColor} rounded-lg flex-shrink-0`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm mb-1">{activity.title}</h4>
                        <p className="text-xs text-muted-foreground">{activity.description}</p>
                        {activity.appSlug && (
                          <Link 
                            href={`/dev/apps/${activity.appSlug}`}
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            View app →
                          </Link>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

