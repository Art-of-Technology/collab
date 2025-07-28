"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, FileText, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useSession } from "next-auth/react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useStoryGeneration } from "@/context/StoryGenerationContext";

interface StoryPreview {
  title: string;
  description: string;
  priority: string;
  storyPoints?: number;
  acceptanceCriteria?: string;
  nonFunctional?: string;
  visuals?: string;
  technicalNotes?: string;
}

interface Epic {
  id: string;
  title: string;
  description?: string;
  priority: string;
}

interface EpicStoryEnhancementModalProps {
  isOpen: boolean;
  onClose: () => void;
  epic: Epic;
  boardId: string;
  onStoriesCreated?: () => void;
}

export function EpicStoryEnhancementModal({
  isOpen,
  onClose,
  epic,
  boardId,
  onStoriesCreated
}: EpicStoryEnhancementModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedStories, setGeneratedStories] = useState<StoryPreview[]>([]);
  const [selectedStories, setSelectedStories] = useState<Set<number>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{
    status: string;
    progress: number;
    currentStep: string;
    createdStoriesCount?: number;
  } | null>(null);
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const { data: session } = useSession();
  const { jobs, refreshJobs } = useStoryGeneration();

  // Reset modal state when opened/closed
  useEffect(() => {
    if (!isOpen) {
      setJobId(null);
      setJobStatus(null);
      setIsSaving(false);
      setIsGenerating(false);
      setGeneratedStories([]);
      setSelectedStories(new Set());
    }
  }, [isOpen]);

  // Watch for job completion
  useEffect(() => {
    if (jobId && jobs.length > 0) {
      const currentJob = jobs.find(job => job.id === jobId);
      if (currentJob) {
        setJobStatus({
          status: currentJob.status,
          progress: currentJob.progress,
          currentStep: currentJob.currentStep,
          createdStoriesCount: currentJob.boardData?.createdStories?.length
        });

        if (currentJob.status === 'COMPLETED') {
          setIsSaving(false);
          toast({
            title: "Stories created successfully",
            description: `${currentJob.boardData?.createdStories?.length || selectedStories.size} stories have been created for this epic.`,
          });
          onStoriesCreated?.();
          onClose();
        } else if (currentJob.status === 'FAILED') {
          setIsSaving(false);
          toast({
            title: "Story creation failed",
            description: currentJob.error || "An error occurred while creating stories.",
            variant: "destructive",
          });
        }
      }
    }
  }, [jobId, jobs, selectedStories.size, toast, onStoriesCreated, onClose]);

  const handleGenerateStories = async () => {
    setIsGenerating(true);
    setGeneratedStories([]);
    setSelectedStories(new Set());

    try {
      const userEmail = session?.user?.email || "user@example.com";
      
      // Create a more detailed epic context for AI
      const epicContext = `
Epic Information:
- Title: ${epic.title}
- Description: ${epic.description || 'No description provided'}
- Priority: ${epic.priority}

Generate detailed user stories that will fully implement this epic. Focus on:
1. Core user stories that deliver the main epic value
2. Supporting stories for setup and configuration
3. Edge case handling and error scenarios
4. Testing and validation stories
5. Integration requirements

Please generate between 5-12 stories that collectively deliver the epic's full scope.

Epic Details:
${epic.description || epic.title}
      `;

      const response = await fetch('/api/ai/generate-stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          epicContext,
          userEmail,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate stories');
      }

      const data = await response.json();
      
      if (data.stories && Array.isArray(data.stories)) {
        setGeneratedStories(data.stories);
        // Select all stories by default
        setSelectedStories(new Set(data.stories.map((_: any, index: number) => index)));
      } else {
        throw new Error('Invalid response format');
      }

    } catch (error) {
      console.error('Error generating stories:', error);
      toast({
        title: "Error",
        description: "Failed to generate stories. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveStories = async () => {
    if (selectedStories.size === 0) {
      toast({
        title: "No stories selected",
        description: "Please select at least one story to save.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const storiesToSave = Array.from(selectedStories).map(index => generatedStories[index]);

      // Start background job for story creation
      const response = await fetch('/api/ai/create-stories/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stories: storiesToSave,
          epicId: epic.id,
          boardId: boardId,
          workspaceId: currentWorkspace?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start story creation');
      }

      const data = await response.json();
      console.log('Story creation started:', data);
      setJobId(data.jobId);

      // Refresh jobs to start tracking the new job
      refreshJobs();

    } catch (error) {
      console.error('Error starting story creation:', error);
      toast({
        title: "Error",
        description: "Failed to start story creation. Please try again.",
        variant: "destructive",
      });
      setIsSaving(false);
    }
  };

  const toggleStorySelection = (index: number) => {
    const newSelected = new Set(selectedStories);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedStories(newSelected);
  };

  const selectAllStories = () => {
    setSelectedStories(new Set(generatedStories.map((_, index) => index)));
  };

  const deselectAllStories = () => {
    setSelectedStories(new Set());
  };

  const getPriorityBadge = (priority: string) => {
    const priorityColors = {
      low: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
    };
    
    return (
      <Badge className={priorityColors[priority as keyof typeof priorityColors] || priorityColors.medium}>
        {priority}
      </Badge>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Enhance Epic with AI Stories
          </DialogTitle>
          <DialogDescription>
            Generate detailed user stories for &quot;{epic.title}&quot; using AI. Review and select which stories to create.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {generatedStories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Ready to generate stories</h3>
                <p className="text-muted-foreground mb-6">
                  AI will analyze your epic and create detailed user stories for implementation
                </p>
                <Button 
                  onClick={handleGenerateStories}
                  disabled={isGenerating}
                  size="lg"
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating Stories...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Stories with AI
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selection Controls */}
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">
                    {selectedStories.size} of {generatedStories.length} stories selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllStories}
                      disabled={selectedStories.size === generatedStories.length}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deselectAllStories}
                      disabled={selectedStories.size === 0}
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  {generatedStories.length} Stories Generated
                </Badge>
              </div>

              {/* Stories List */}
              <div className="grid gap-4">
                {generatedStories.map((story, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 space-y-3 transition-all ${
                      selectedStories.has(index)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedStories.has(index)}
                        onCheckedChange={() => toggleStorySelection(index)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <h4 className="font-medium leading-tight">{story.title}</h4>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {getPriorityBadge(story.priority)}
                            {story.storyPoints && (
                              <Badge variant="outline" className="gap-1">
                                <Target className="h-3 w-3" />
                                {story.storyPoints} pts
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-sm text-muted-foreground">
                          <MarkdownContent htmlContent={story.description} content={story.description} />
                        </div>

                        {story.acceptanceCriteria && (
                          <div className="text-sm">
                            <div className="font-medium text-muted-foreground mb-1">Acceptance Criteria:</div>
                            <div className="text-muted-foreground">
                              <MarkdownContent htmlContent={story.acceptanceCriteria} content={story.acceptanceCriteria} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {generatedStories.length > 0 && (
          <div className="pt-4 border-t space-y-4">
            {/* Job Status Display */}
            {isSaving && jobStatus && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Creating Stories...</span>
                  <span className="text-muted-foreground">{jobStatus.progress}%</span>
                </div>
                <Progress value={jobStatus.progress} className="h-2" />
                <p className="text-sm text-muted-foreground">{jobStatus.currentStep}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveStories}
                disabled={isSaving || selectedStories.size === 0}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Stories...
                  </>
                ) : (
                  <>
                    Create {selectedStories.size} Stor{selectedStories.size !== 1 ? 'ies' : 'y'}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
} 