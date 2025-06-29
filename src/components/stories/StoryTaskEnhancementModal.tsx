"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Check, Clock, Code, Palette, Bug, TestTube, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useSession } from "next-auth/react";
import { Checkbox } from "@/components/ui/checkbox";
import { useTaskGeneration } from "@/context/TaskGenerationContext";

interface TaskPreview {
  title: string;
  description: string;
  type: string;
  priority: "low" | "medium" | "high";
  estimate: string;
  taskCategory: string;
  labels: string[];
}

interface StoryTaskEnhancementModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: {
    id: string;
    title: string;
    description?: string | null;
    priority: string;
    points?: number | null;
  };
  boardId?: string;
  onTasksCreated?: () => void;
}

export function StoryTaskEnhancementModal({
  isOpen,
  onClose,
  story,
  boardId,
  onTasksCreated
}: StoryTaskEnhancementModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState<TaskPreview[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{
    status: string;
    progress: number;
    currentStep: string;
    createdTasksCount?: number;
  } | null>(null);
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const { data: session } = useSession();
  const { jobs, refreshJobs } = useTaskGeneration();

  // Reset modal state when opened/closed
  useEffect(() => {
    if (!isOpen) {
      setJobId(null);
      setJobStatus(null);
      setIsSaving(false);
      setIsGenerating(false);
      setGeneratedTasks([]);
      setSelectedTasks(new Set());
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
          createdTasksCount: currentJob.boardData?.createdTasks?.length
        });

        if (currentJob.status === 'COMPLETED') {
          setIsSaving(false);
          toast({
            title: "Tasks created successfully",
            description: `${currentJob.boardData?.createdTasks?.length || selectedTasks.size} tasks have been created for this story.`,
          });
          onTasksCreated?.();
          onClose();
        } else if (currentJob.status === 'FAILED') {
          setIsSaving(false);
          toast({
            title: "Task creation failed",
            description: currentJob.error || "An error occurred while creating tasks.",
            variant: "destructive",
          });
        }
      }
    }
  }, [jobId, jobs, selectedTasks.size, toast, onTasksCreated, onClose]);

  const handleGenerateTasks = async () => {
    setIsGenerating(true);
    setGeneratedTasks([]);
    setSelectedTasks(new Set());

    try {
      const userEmail = session?.user?.email || "user@example.com";
      
      // Create a more detailed story context for AI
      const storyContext = `
Story Information:
- Title: ${story.title}
- Description: ${story.description || 'No description provided'}
- Priority: ${story.priority}
- Story Points: ${story.points || 'Not estimated'}

Generate detailed technical tasks that will fully implement this user story. Focus on:
1. Frontend implementation tasks
2. Backend API development
3. Database operations
4. Testing requirements
5. Integration tasks
6. Error handling and validation

Please generate between 5-10 tasks that cover all aspects of implementing this story.

Story Details:
${story.description || story.title}
      `;

      const response = await fetch('/api/ai/generate-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storyContext,
          userEmail,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate tasks');
      }

      const data = await response.json();
      
      if (data.tasks && Array.isArray(data.tasks)) {
        setGeneratedTasks(data.tasks);
        // Select all tasks by default
        setSelectedTasks(new Set(data.tasks.map((_: any, index: number) => index)));
      } else {
        throw new Error('Invalid response format');
      }

    } catch (error) {
      console.error('Error generating tasks:', error);
      toast({
        title: "Error",
        description: "Failed to generate tasks. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveTasks = async () => {
    if (selectedTasks.size === 0) {
      toast({
        title: "No tasks selected",
        description: "Please select at least one task to save.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const tasksToSave = Array.from(selectedTasks).map(index => generatedTasks[index]);

      // Start background job for task creation
      const response = await fetch('/api/ai/create-tasks/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks: tasksToSave,
          storyId: story.id,
          boardId: boardId,
          workspaceId: currentWorkspace?.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start task creation');
      }

      const data = await response.json();
      console.log('Task creation started:', data);
      setJobId(data.jobId);

      // Refresh jobs to start tracking the new job
      refreshJobs();

    } catch (error) {
      console.error('Error starting task creation:', error);
      toast({
        title: "Error",
        description: "Failed to start task creation. Please try again.",
        variant: "destructive",
      });
      setIsSaving(false);
    }
  };

  const toggleTaskSelection = (index: number) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTasks(newSelected);
  };

  const selectAllTasks = () => {
    setSelectedTasks(new Set(generatedTasks.map((_, index) => index)));
  };

  const deselectAllTasks = () => {
    setSelectedTasks(new Set());
  };

  const getTaskCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'fe':
      case 'frontend':
        return <Palette className="h-4 w-4" />;
      case 'be':
      case 'backend':
        return <Code className="h-4 w-4" />;
      case 'testing':
        return <TestTube className="h-4 w-4" />;
      case 'infra':
        return <Bug className="h-4 w-4" />;
      default:
        return <Check className="h-4 w-4" />;
    }
  };

  const getTaskCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'fe':
      case 'frontend':
        return 'text-purple-600 bg-purple-100';
      case 'be':
      case 'backend':
        return 'text-blue-600 bg-blue-100';
      case 'testing':
        return 'text-green-600 bg-green-100';
      case 'infra':
        return 'text-orange-600 bg-orange-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Enhance Story with AI Tasks
          </DialogTitle>
          <DialogDescription>
            Generate detailed technical tasks for "{story.title}" using AI. Review and select which tasks to create.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {generatedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Ready to generate tasks</h3>
                <p className="text-muted-foreground mb-6">
                  AI will analyze your story and create detailed implementation tasks
                </p>
                <Button 
                  onClick={handleGenerateTasks}
                  disabled={isGenerating}
                  size="lg"
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating Tasks...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Tasks with AI
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Generated Tasks ({generatedTasks.length})</h3>
                  <Badge variant="secondary">
                    {selectedTasks.size} selected
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={selectAllTasks}
                    disabled={selectedTasks.size === generatedTasks.length}
                  >
                    Select All
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={deselectAllTasks}
                    disabled={selectedTasks.size === 0}
                  >
                    Deselect All
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGenerateTasks}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Regenerate"
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {generatedTasks.map((task, index) => (
                  <Card 
                    key={index} 
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedTasks.has(index) ? 'ring-2 ring-primary bg-primary/5' : ''
                    }`}
                    onClick={() => toggleTaskSelection(index)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedTasks.has(index)}
                          onChange={() => toggleTaskSelection(index)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{task.title}</CardTitle>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getTaskCategoryColor(task.taskCategory)}`}
                            >
                              {getTaskCategoryIcon(task.taskCategory)}
                              <span className="ml-1">{task.taskCategory.toUpperCase()}</span>
                            </Badge>
                            <Badge 
                              variant={
                                task.priority === 'high' ? 'destructive' : 
                                task.priority === 'medium' ? 'default' : 
                                'secondary'
                              }
                              className="text-xs"
                            >
                              {task.priority}
                            </Badge>
                            <Badge variant="outline" className="text-xs gap-1">
                              <Clock className="h-3 w-3" />
                              {task.estimate}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div 
                        className="text-sm text-muted-foreground prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: task.description }}
                      />
                      {task.labels.length > 0 && (
                        <div className="flex gap-1 mt-3">
                          {task.labels.map((label, labelIndex) => (
                            <Badge key={labelIndex} variant="outline" className="text-xs">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {generatedTasks.length > 0 && (
          <div className="pt-4 border-t space-y-4">
            {/* Job Status Display */}
            {isSaving && jobStatus && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Creating Tasks...</span>
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
                onClick={handleSaveTasks}
                disabled={isSaving || selectedTasks.size === 0}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Tasks...
                  </>
                ) : (
                  <>
                    Create {selectedTasks.size} Task{selectedTasks.size !== 1 ? 's' : ''}
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