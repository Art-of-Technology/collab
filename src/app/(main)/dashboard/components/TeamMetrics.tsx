'use client';

import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Heart, MessageSquare, TrendingUp, Loader2 } from "lucide-react";
import { useTeamMetrics } from "@/hooks/queries/useDashboard";

interface TeamMetricsProps {
  workspaceId: string;
  initialMetrics?: number[];
}

export function TeamMetrics({ workspaceId, initialMetrics }: TeamMetricsProps) {
  // Use TanStack Query for data fetching with initial data from server
  const { data: metrics = initialMetrics || [0, 0, 0, 0], isLoading } = useTeamMetrics(workspaceId);

  if (isLoading && !initialMetrics?.length) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-2">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="h-6 w-8 bg-muted-foreground/20 animate-pulse rounded"></p>
                <p className="h-4 w-24 bg-muted-foreground/20 animate-pulse rounded"></p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metricsConfig = [
    {
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
      label: "Posts this week",
      value: metrics[0],
      bgColor: "bg-primary/10",
    },
    {
      icon: <MessageSquare className="h-5 w-5 text-blue-500" />,
      label: "Comments this week",
      value: metrics[1],
      bgColor: "bg-blue-500/10",
    },
    {
      icon: <Heart className="h-5 w-5 text-red-500" />,
      label: "Reactions this week",
      value: metrics[2],
      bgColor: "bg-red-500/10",
    },
    {
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
      label: "Active blockers",
      value: metrics[3],
      bgColor: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metricsConfig.map((metric, index) => (
        <Card key={index} className="bg-card/90 backdrop-blur-sm shadow-md border-border/50 hover:shadow-lg transition-all duration-300">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`p-2 ${metric.bgColor} rounded-full`}>
                {metric.icon}
              </div>
              <p className="text-2xl font-bold">{metric.value}</p>
              <p className="text-sm text-muted-foreground">{metric.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 