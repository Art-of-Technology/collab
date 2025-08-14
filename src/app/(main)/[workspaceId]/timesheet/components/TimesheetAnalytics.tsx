"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  PieChart, 
  Clock, 
  Target,
  TrendingUp,
  TrendingDown,
  Coffee,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TimesheetData } from "@/app/api/activities/timesheet/route";
import type { TimesheetFilters } from "@/hooks/queries/useTimesheet";
import { formatDurationUI } from "@/utils/duration";

interface TimesheetAnalyticsProps {
  data: TimesheetData;
  filters: TimesheetFilters;
}

export function TimesheetAnalytics({ data, filters }: TimesheetAnalyticsProps) {
  // Calculate analytics data
  const analytics = useMemo(() => {
    const { entries } = data;
    
    // Group by activity type
    const timeByActivity = entries.reduce((acc, entry) => {
      const type = entry.activityType;
      acc[type] = (acc[type] || 0) + entry.totalDuration;
      return acc;
    }, {} as Record<string, number>);

    // Group by task/board
    const timeByBoard = entries
      .filter(entry => entry.task?.taskBoard)
      .reduce((acc, entry) => {
        const boardName = entry.task?.taskBoard?.name || 'Unknown';
        acc[boardName] = (acc[boardName] || 0) + entry.totalDuration;
        return acc;
      }, {} as Record<string, number>);

    // Daily breakdown for weekly/monthly views
    const dailyBreakdown: Record<string, number> = {};
    entries.forEach(entry => {
      const date = entry.date;
      dailyBreakdown[date] = (dailyBreakdown[date] || 0) + entry.totalDuration;
    });

    // Task completion stats
    const taskStats = {
      completed: entries.filter(e => e.status === 'completed').length,
      ongoing: entries.filter(e => e.status === 'ongoing').length,
      paused: entries.filter(e => e.status === 'paused').length,
    };

    // Session patterns
    const totalSessions = entries.reduce((sum, entry) => sum + entry.sessions.length, 0);
    const avgSessionDuration = totalSessions > 0 ? 
      entries.reduce((sum, entry) => sum + entry.totalDuration, 0) / totalSessions : 0;

    return {
      timeByActivity,
      timeByBoard,
      dailyBreakdown,
      taskStats,
      totalSessions,
      avgSessionDuration,
    };
  }, [data]);



  const getActivityColor = (activity: string) => {
    const colors: Record<string, string> = {
      work: 'bg-green-500',
      break: 'bg-orange-500',
      lunch: 'bg-yellow-500',
      meeting: 'bg-blue-500',
      travel: 'bg-purple-500',
      review: 'bg-teal-500',
      research: 'bg-cyan-500',
    };
    return colors[activity] || 'bg-gray-500';
  };

  // Calculate percentage for each activity
  const totalTime = Object.values(analytics.timeByActivity).reduce((sum, time) => sum + time, 0);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDurationUI(analytics.avgSessionDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalSessions} total sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Task Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Completed</span>
                <span className="font-medium">{analytics.taskStats.completed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Ongoing</span>
                <span className="font-medium">{analytics.taskStats.ongoing}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Paused</span>
                <span className="font-medium">{analytics.taskStats.paused}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Focus Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.summary.productivityScore}%
            </div>
            <Progress value={data.summary.productivityScore} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Work vs total time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time Distribution by Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Time Distribution by Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(analytics.timeByActivity)
              .sort(([,a], [,b]) => b - a)
              .map(([activity, time]) => {
                const percentage = totalTime > 0 ? (time / totalTime) * 100 : 0;
                return (
                  <div key={activity} className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getActivityColor(activity)}`} />
                        <span className="font-medium capitalize">{activity}</span>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="font-medium">{formatDurationUI(time)}</div>
                        <div className="text-xs text-muted-foreground">
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Time by Board */}
      {Object.keys(analytics.timeByBoard).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Time by Board
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(analytics.timeByBoard)
                .sort(([,a], [,b]) => b - a)
                .map(([board, time]) => {
                  const workTime = analytics.timeByActivity.work || 0;
                  const percentage = workTime > 0 ? (time / workTime) * 100 : 0;
                  return (
                    <div key={board} className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="font-medium">{board}</span>
                        <div className="text-left sm:text-right">
                          <div className="font-medium">{formatDurationUI(time)}</div>
                          <div className="text-xs text-muted-foreground">
                            {percentage.toFixed(1)}% of work time
                          </div>
                        </div>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Breakdown */}
      {(filters.view === 'weekly' || filters.view === 'monthly') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Daily Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.dailyBreakdown)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, time]) => {
                  const maxTime = Math.max(...Object.values(analytics.dailyBreakdown));
                  const percentage = maxTime > 0 ? (time / maxTime) * 100 : 0;
                  
                  return (
                    <div key={date} className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                        <span className="font-medium">
                          {format(parseISO(date), 'EEE, MMM d')}
                        </span>
                        <span className="font-medium">{formatDurationUI(time)}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {data.summary.productivityScore >= 80 && (
              <div className="flex items-center gap-2 text-green-700">
                <TrendingUp className="h-4 w-4" />
                <span>Great productivity! You&apos;re maintaining excellent focus.</span>
              </div>
            )}
            
            {data.summary.productivityScore < 50 && (
              <div className="flex items-center gap-2 text-orange-700">
                <TrendingDown className="h-4 w-4" />
                <span>Consider reducing break time or increasing focused work sessions.</span>
              </div>
            )}

            {analytics.avgSessionDuration < 30 * 60 * 1000 && (
              <div className="flex items-center gap-2 text-blue-700">
                <Clock className="h-4 w-4" />
                <span>Your sessions are quite short. Consider longer focused work periods.</span>
              </div>
            )}

            {analytics.avgSessionDuration > 2 * 60 * 60 * 1000 && (
              <div className="flex items-center gap-2 text-purple-700">
                <Coffee className="h-4 w-4" />
                <span>Long sessions detected. Remember to take regular breaks.</span>
              </div>
            )}

            {analytics.taskStats.paused > analytics.taskStats.completed && (
              <div className="flex items-center gap-2 text-yellow-700">
                <Target className="h-4 w-4" />
                <span>Many paused tasks. Consider focusing on fewer tasks at once.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 