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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, index) => (
          <Card key={index} className="border border-border/40 bg-card/50">
            <CardContent className="p-4">
              <div className="flex flex-col items-center text-center space-y-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <p className="h-5 w-6 bg-muted-foreground/20 animate-pulse rounded"></p>
                <p className="h-3 w-20 bg-muted-foreground/20 animate-pulse rounded"></p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metricsConfig = [
    {
      icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />,
      label: "Posts this week",
      value: metrics[0],
    },
    {
      icon: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
      label: "Comments this week",
      value: metrics[1],
    },
    {
      icon: <Heart className="h-4 w-4 text-muted-foreground" />,
      label: "Reactions this week",
      value: metrics[2],
    },
    {
      icon: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
      label: "Active blockers",
      value: metrics[3],
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metricsConfig.map((metric, index) => (
        <Card key={index} className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
          <CardContent className="p-4">
            <div className="flex flex-col items-center text-center space-y-1.5">
              {metric.icon}
              <p className="text-xl font-semibold text-foreground">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 