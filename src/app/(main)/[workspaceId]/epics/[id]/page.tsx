"use client";

import { useState, useEffect } from "react";
import { EpicDetailContent } from "@/components/epics/EpicDetailContent";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function EpicPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const [epic, setEpic] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [epicId, setEpicId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Resolve params first
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      setEpicId(resolvedParams.id);
      setWorkspaceId(resolvedParams.workspaceId);
    };
    resolveParams();
  }, [params]);

  useEffect(() => {
    if (!epicId) return;

    const fetchEpic = async () => {
      setError(null);
      try {
        const response = await fetch(`/api/epics/${epicId}`);
        
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        
        const data = await response.json();
        setEpic(data);
      } catch (err) {
        console.error("Failed to fetch epic:", err);
        setError("Failed to load epic details. Please try again.");
      }
    };

    fetchEpic();
  }, [epicId]);

  const handleRefresh = () => {
    if (epicId) {
      fetch(`/api/epics/${epicId}`)
        .then(response => {
          if (!response.ok) throw new Error("Failed to refresh");
          return response.json();
        })
        .then(data => setEpic(data))
        .catch(err => {
          console.error("Error refreshing epic:", err);
          // Don't set error state on refresh failure to keep showing content
        });
    }
  };

  const boardId = epic?.taskBoardId || '';
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
      
      <EpicDetailContent
        epic={epic}
        error={error}
        onRefresh={handleRefresh}
      />
    </div>
  );
} 