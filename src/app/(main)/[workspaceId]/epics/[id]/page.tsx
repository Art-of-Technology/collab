"use client";

import { useState, useEffect } from "react";
import { EpicDetailContent } from "@/components/epics/EpicDetailContent";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { urls } from "@/lib/url-resolver";
import { getWorkspaceSlug, getBoardSlug } from "@/lib/client-slug-resolvers";

export default function EpicPage({ params }: { params: Promise<{ workspaceId: string; id: string }> }) {
  const [epic, setEpic] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [epicId, setEpicId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string>('#');

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

  // Generate back URL using URL resolver when epic and workspaceId are available
  useEffect(() => {
    const generateBackUrl = async () => {
      if (!workspaceId || !epic) return;
      
      const boardId = epic.taskBoardId || '';
      
      try {
        // Get the workspace slug for URL generation
        const workspaceSlug = await getWorkspaceSlug(workspaceId);
        
        // Get the board slug for URL generation
        const boardSlug = boardId ? await getBoardSlug(boardId, workspaceId) : null;
        
        if (workspaceSlug && boardSlug) {
          const url = urls.board({
            workspaceSlug,
            boardSlug,
            view: 'kanban'
          });
          setBackUrl(url);
          return;
        }
      } catch (err) {
        console.log('Failed to resolve slugs, using fallback URL:', err);
      }
      
      // Fallback to legacy URL
      setBackUrl(`/${workspaceId}/tasks${boardId ? `?board=${boardId}` : ''}`);
    };

    generateBackUrl();
  }, [workspaceId, epic]);

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