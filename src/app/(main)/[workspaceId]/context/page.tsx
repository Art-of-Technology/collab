"use client";

import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useProjects } from "@/hooks/queries/useProjects";
import { ContextBrowser } from "@/components/context/ContextBrowser";

/**
 * Context: the folders, Notes and files of this workspace and of its projects. The address carries
 * which level, which folder and which Note are open, so each can be linked to and opened again later.
 */
export default function ContextPage() {
  const { currentWorkspace, isLoading } = useWorkspace();
  const { data: projects = [] } = useProjects({ workspaceId: currentWorkspace?.id });
  const query = useSearchParams();

  if (isLoading || !currentWorkspace) {
    return <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>;
  }

  return <ContextBrowser
    key={currentWorkspace.id}
    workspaceId={currentWorkspace.id}
    workspaceSlug={currentWorkspace.slug || currentWorkspace.id}
    projects={projects.map(project => ({ id: project.id, name: project.name }))}
    initialProjectId={query.get("project")}
    initialFolderId={query.get("folder")}
    initialView={query.get("view")}
    initialNoteId={query.get("note")}
  />;
}
