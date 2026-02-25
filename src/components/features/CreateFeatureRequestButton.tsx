"use client";

import { useState } from "react";
import { Plus, Loader2, Lightbulb } from "lucide-react";
import { useCreateFeatureRequest } from "@/hooks/queries/useFeature";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichEditor } from "@/components/RichEditor";
import { extractMentionUserIds } from "@/utils/mentions";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useProjects } from "@/hooks/queries/useProjects";
import { cn } from "@/lib/utils";
import axios from "axios";

interface CreateFeatureRequestButtonProps {
  projectId?: string;
  projectName?: string;
}

export default function CreateFeatureRequestButton({
  projectId: defaultProjectId,
  projectName,
}: CreateFeatureRequestButtonProps = {}) {
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const { data: projects = [] } = useProjects({ workspaceId: currentWorkspace?.id });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(defaultProjectId || "");

  const createFeature = useCreateFeatureRequest();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const projectToUse = defaultProjectId || selectedProjectId;

    if (!title.trim() || !description.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!projectToUse) {
      toast({
        title: "Project required",
        description: "Please select a project for this feature request",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("html", description);
    formData.append("projectId", projectToUse);

    if (currentWorkspace?.id) {
      formData.append("workspaceId", currentWorkspace.id);
    }

    try {
      createFeature.mutate(formData, {
        onSuccess: async (createdFeature) => {
          if (createdFeature?.id) {
            const mentionedUserIds = extractMentionUserIds(description);
            if (mentionedUserIds.length > 0) {
              try {
                await axios.post("/api/mentions", {
                  userIds: mentionedUserIds,
                  sourceType: "feature",
                  sourceId: createdFeature.id,
                  content: `mentioned you in a feature request: "${title.length > 100 ? title.substring(0, 97) + "..." : title}"`,
                });
              } catch (error) {
                console.error("Failed to process mentions:", error);
              }
            }
          }

          toast({
            title: "Feature request submitted",
            description: "Your feature request has been submitted successfully",
          });
          setTitle("");
          setDescription("");
          if (!defaultProjectId) {
            setSelectedProjectId("");
          }
          setOpen(false);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to submit your feature request",
            variant: "destructive",
          });
        },
      });
    } catch (error) {
      console.error("Error submitting feature request:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Request</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-collab-800 border-collab-700 p-0 overflow-hidden">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-collab-700">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Lightbulb className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-lg font-medium text-collab-50">
                New Feature Request
              </DialogTitle>
              <DialogDescription className="text-sm text-collab-500">
                Share your idea with the team
              </DialogDescription>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-5">
            {/* Project Selector */}
            {!defaultProjectId && projects && projects.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-collab-400">
                  Project <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-collab-900 border border-collab-700 text-sm text-collab-50 focus:outline-none focus:border-collab-500/50 transition-colors appearance-none cursor-pointer"
                    required
                  >
                    <option value="" className="bg-collab-800 text-collab-500">
                      Select a project
                    </option>
                    {projects.map((project) => (
                      <option
                        key={project.id}
                        value={project.id}
                        className="bg-collab-800 text-collab-50"
                      >
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg
                      className="w-4 h-4 text-collab-500/60"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Project Badge (when at project level) */}
            {defaultProjectId && projectName && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-collab-500/60">Project:</span>
                <span className="text-collab-50 font-medium">{projectName}</span>
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-sm text-collab-400">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief title for your feature idea"
                className="h-10 bg-collab-900 border-collab-700 text-collab-50 placeholder:text-collab-500/60 focus:border-collab-500/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm text-collab-400">Description</Label>
              <div className="rounded-lg border border-collab-700 overflow-hidden bg-collab-900">
                <RichEditor
                  value={description}
                  onChange={(html, text) => setDescription(html)}
                  placeholder="Describe your feature idea in detail. What problem does it solve? How should it work?"
                  minHeight="160px"
                  toolbarMode="static"
                  showAiImprove={true}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-collab-700 bg-collab-900">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="h-9 px-4 text-collab-500 hover:text-collab-50 hover:bg-collab-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createFeature.isPending}
              className="h-9 px-4 bg-amber-500 hover:bg-amber-400 text-black font-medium"
            >
              {createFeature.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
