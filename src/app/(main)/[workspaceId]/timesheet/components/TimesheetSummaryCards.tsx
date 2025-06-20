"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Clock, 
  Target, 
  Coffee, 
  Users, 
  TrendingUp,
  Play,
  Pause,
  Zap,
  Activity,
  Timer
} from "lucide-react";
import type { TimesheetSummary } from "@/app/api/activities/timesheet/route";

interface TimesheetSummaryCardsProps {
  summary: TimesheetSummary;
}

export function TimesheetSummaryCards({ summary }: TimesheetSummaryCardsProps) {
  const summaryCards = [
    {
      title: "Total Work Time",
      value: summary.formattedTotalWorkTime,
      icon: <Target className="h-4 w-4" />,
      description: `${summary.totalTasks} tasks tracked`,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Break Time",
      value: summary.formattedTotalBreakTime,
      icon: <Coffee className="h-4 w-4" />,
      description: "Lunch & breaks",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Meeting Time",
      value: summary.formattedTotalMeetingTime,
      icon: <Users className="h-4 w-4" />,
      description: "Collaborative time",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Productivity",
      value: `${summary.productivityScore}%`,
      icon: <TrendingUp className="h-4 w-4" />,
      description: "Work vs total time",
      color: summary.productivityScore >= 70 ? "text-green-600" : summary.productivityScore >= 50 ? "text-yellow-600" : "text-red-600",
      bgColor: summary.productivityScore >= 70 ? "bg-green-50" : summary.productivityScore >= 50 ? "bg-yellow-50" : "bg-red-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {summaryCards.map((card, index) => (
        <Card key={index} className="hover:shadow-lg hover:scale-[1.02] transition-all duration-200 border-l-4 border-l-transparent hover:border-l-blue-500 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`${card.bgColor} p-3 rounded-xl shadow-sm ${card.color} relative`}>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
              <div className="relative">
                {card.icon}
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-2xl font-bold mb-1">{card.value}</div>
            <p className="text-xs text-muted-foreground">
              {card.description}
            </p>
            {card.title === "Productivity" && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Score</span>
                  <span className="text-xs font-medium">{summary.productivityScore}%</span>
                </div>
                <Progress 
                  value={summary.productivityScore} 
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Poor</span>
                  <span>Excellent</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Active Tasks Status */}
      {(summary.totalActiveTasks > 0 || summary.totalPausedTasks > 0) && (
        <Card className="md:col-span-2 lg:col-span-4 border-l-4 border-l-green-500 bg-gradient-to-r from-green-50/50 to-transparent dark:from-green-950/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent" />
          <CardContent className="pt-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="h-10 w-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm flex items-center justify-center">
                      <Activity className="h-5 w-5 text-white" />
                    </div>
                    <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full animate-pulse"></div>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">Live Sessions</span>
                    <p className="text-xs text-muted-foreground">Currently active work</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 shadow-sm">
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse mr-2" />
                    {summary.totalActiveTasks} active
                  </Badge>
                  {summary.totalPausedTasks > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 shadow-sm">
                      <Pause className="h-3 w-3 mr-1" />
                      {summary.totalPausedTasks} paused
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  {summary.totalActiveTasks + summary.totalPausedTasks}
                </div>
                <div className="text-xs text-muted-foreground">total active</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 