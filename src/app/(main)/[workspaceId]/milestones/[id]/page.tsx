"use client";

import { useState, useEffect } from "react";
import { MilestoneDetailContent } from "@/components/milestones/MilestoneDetailContent";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function MilestonePage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const [milestone, setMilestone] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Resolve params first
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      setMilestoneId(resolvedParams.id);
      setWorkspaceId(resolvedParams.workspaceId);
    };
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (!milestoneId) return;

    const fetchMilestone = async () => {
      setError(null);
      
      try {
        const response = await fetch(`/api/milestones/${milestoneId}`);
        
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        
        const data = await response.json();
        setMilestone(data);
      } catch (err) {
        console.error("Failed to fetch milestone:", err);
        setError("Failed to load milestone details. Please try again.");
      }
    };

    fetchMilestone();
  }, [milestoneId]);

  const handleRefresh = () => {
    if (milestoneId) {
      fetch(`/api/milestones/${milestoneId}`)
        .then(response => {
          if (!response.ok) throw new Error("Failed to refresh");
          return response.json();
        })
        .then(data => setMilestone(data))
        .catch(err => {
          console.error("Error refreshing milestone:", err);
          // Don't set error state on refresh failure to keep showing content
        });
    }
  };

  const boardId = milestone?.taskBoardId || '';
  const backUrl = workspaceId ? `/${workspaceId}/tasks${boardId ? `?board=${boardId}` : ''}` : '#';

  return (
    <div className="container py-6 max-w-7xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="flex items-center justify-start w-max gap-1 text-muted-foreground hover:text-foreground">
          <Link href={backUrl}>
            <ChevronLeft className="h-4 w-4" />
            Back to Board
          </Link>
        </Button>
      </div>
      
      <MilestoneDetailContent
        milestone={milestone}
        error={error}
        onRefresh={handleRefresh}
      />
    </div>
  );
} 