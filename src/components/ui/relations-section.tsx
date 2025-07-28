"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";

interface RelationItemProps {
  title: string;
  type: 'milestone' | 'epic' | 'story' | 'task';
  issueKey?: string;
  status?: string;
  href: string;
}

function RelationItem({ title, type, issueKey, status, href }: RelationItemProps) {
  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'milestone':
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case 'epic':
        return "bg-purple-50 text-purple-700 border-purple-200";
      case 'story':
        return "bg-blue-50 text-blue-700 border-blue-200";
      case 'task':
        return "bg-gray-50 text-gray-700 border-gray-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const statusColors = {
      'DONE': 'bg-green-500',
      'IN_PROGRESS': 'bg-blue-500', 
      'IN PROGRESS': 'bg-blue-500',
      'TODO': 'bg-gray-500',
      'BACKLOG': 'bg-gray-500',
    };
    
    const color = statusColors[status as keyof typeof statusColors] || 'bg-gray-500';
    
    return (
      <Badge className={`${color} text-white flex-shrink-0 ml-1`}>
        {status}
      </Badge>
    );
  };

  return (
    <Link 
      href={href} 
      className="flex items-center justify-between gap-2 text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge variant="outline" className={getBadgeStyle(type)}>
          {issueKey || type.charAt(0).toUpperCase() + type.slice(1)}
        </Badge>
        <span className="truncate">{title}</span>
      </div>
      {getStatusBadge(status)}
    </Link>
  );
}

interface TaskRelationsProps {
  task: any;
}

export function TaskRelations({ task }: TaskRelationsProps) {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Milestone */}
          <div>
            <h4 className="text-sm font-medium mb-2">Milestone</h4>
            {task.milestone ? (
              <RelationItem
                title={task.milestone.title}
                type="milestone"
                href={currentWorkspace ? 
                  (currentWorkspace.slug && task.milestone.issueKey 
                    ? `/${currentWorkspace.slug}/milestones/${task.milestone.issueKey}`
                    : `/${currentWorkspace.id}/milestones/${task.milestoneId}`
                  ) : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No milestone linked
              </div>
            )}
          </div>

          {/* Epic */}
          <div>
            <h4 className="text-sm font-medium mb-2">Epic</h4>
            {task.epic ? (
              <RelationItem
                title={task.epic.title}
                type="epic"
                href={currentWorkspace ? 
                  (currentWorkspace.slug && task.epic.issueKey 
                    ? `/${currentWorkspace.slug}/epics/${task.epic.issueKey}`
                    : `/${currentWorkspace.id}/epics/${task.epicId}`
                  ) : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No epic linked
              </div>
            )}
          </div>

          {/* Story */}
          <div>
            <h4 className="text-sm font-medium mb-2">Story</h4>
            {task.story ? (
              <RelationItem
                title={task.story.title}
                type="story"
                href={currentWorkspace ? 
                  (currentWorkspace.slug && task.story.issueKey 
                    ? `/${currentWorkspace.slug}/stories/${task.story.issueKey}`
                    : `/${currentWorkspace.id}/stories/${task.storyId}`
                  ) : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No story linked
              </div>
            )}
          </div>

          {/* Parent Task */}
          <div>
            <h4 className="text-sm font-medium mb-2">Parent Task</h4>
            {task.parentTask ? (
              <RelationItem
                title={task.parentTask.title}
                type="task"
                issueKey={task.parentTask.issueKey}
                href={currentWorkspace ? 
                  (currentWorkspace.slug && task.parentTask.issueKey 
                    ? `/${currentWorkspace.slug}/tasks/${task.parentTask.issueKey}`
                    : `/${currentWorkspace.id}/tasks/${task.parentTaskId}`
                  ) : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No parent task
              </div>
            )}
          </div>

          {/* Subtasks */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Subtasks ({task.subtasks.length})</h4>
              <div className="space-y-2">
                {task.subtasks.map((subtask: any) => (
                  <RelationItem
                    key={subtask.id}
                    title={subtask.title}
                    type="task"
                    issueKey={subtask.issueKey}
                    status={subtask.status}
                    href={currentWorkspace ? 
                      (currentWorkspace.slug && subtask.issueKey 
                        ? `/${currentWorkspace.slug}/tasks/${subtask.issueKey}`
                        : `/${currentWorkspace.id}/tasks/${subtask.id}`
                      ) : "#"}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface EpicRelationsProps {
  epic: any;
}

export function EpicRelations({ epic }: EpicRelationsProps) {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Milestone */}
          <div>
            <h4 className="text-sm font-medium mb-2">Milestone</h4>
            {epic.milestone ? (
              <RelationItem
                title={epic.milestone.title}
                type="milestone"
                href={currentWorkspace ? 
                  (currentWorkspace.slug && epic.milestone.issueKey 
                    ? `/${currentWorkspace.slug}/milestones/${epic.milestone.issueKey}`
                    : `/${currentWorkspace.id}/milestones/${epic.milestoneId}`
                  ) : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No milestone linked
              </div>
            )}
          </div>

          {/* Stories */}
          <div>
            <h4 className="text-sm font-medium mb-2">Stories ({epic.stories?.length || 0})</h4>
            {epic.stories && epic.stories.length > 0 ? (
              <div className="space-y-2">
                {epic.stories.map((story: any) => (
                  <RelationItem
                    key={story.id}
                    title={story.title}
                    type="story"
                    status={story.status}
                    href={currentWorkspace ? 
                      (currentWorkspace.slug && story.issueKey 
                        ? `/${currentWorkspace.slug}/stories/${story.issueKey}`
                        : `/${currentWorkspace.id}/stories/${story.id}`
                      ) : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No stories linked
              </div>
            )}
          </div>

          {/* Tasks */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tasks ({epic.tasks?.length || 0})</h4>
            {epic.tasks && epic.tasks.length > 0 ? (
              <div className="space-y-2">
                {epic.tasks.map((task: any) => (
                  <RelationItem
                    key={task.id}
                    title={task.title}
                    type="task"
                    issueKey={task.issueKey}
                    status={task.status}
                    href={currentWorkspace ? 
                      (currentWorkspace.slug && task.issueKey 
                        ? `/${currentWorkspace.slug}/tasks/${task.issueKey}`
                        : `/${currentWorkspace.id}/tasks/${task.id}`
                      ) : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No tasks linked
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StoryRelationsProps {
  story: any;
}

export function StoryRelations({ story }: StoryRelationsProps) {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Epic */}
          <div>
            <h4 className="text-sm font-medium mb-2">Epic</h4>
            {story.epic ? (
              <RelationItem
                title={story.epic.title}
                type="epic"
                href={currentWorkspace ? 
                  (currentWorkspace.slug && story.epic.issueKey 
                    ? `/${currentWorkspace.slug}/epics/${story.epic.issueKey}`
                    : `/${currentWorkspace.id}/epics/${story.epicId}`
                  ) : "#"}
              />
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No epic linked
              </div>
            )}
          </div>

          {/* Tasks */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tasks ({story.tasks?.length || 0})</h4>
            {story.tasks && story.tasks.length > 0 ? (
              <div className="space-y-2">
                {story.tasks.map((task: any) => (
                  <RelationItem
                    key={task.id}
                    title={task.title}
                    type="task"
                    issueKey={task.issueKey}
                    status={task.status}
                    href={currentWorkspace ? 
                      (currentWorkspace.slug && task.issueKey 
                        ? `/${currentWorkspace.slug}/tasks/${task.issueKey}`
                        : `/${currentWorkspace.id}/tasks/${task.id}`
                      ) : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No tasks linked
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface MilestoneRelationsProps {
  milestone: any;
}

export function MilestoneRelations({ milestone }: MilestoneRelationsProps) {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Relations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Epics */}
          <div>
            <h4 className="text-sm font-medium mb-2">Epics ({milestone.epics?.length || 0})</h4>
            {milestone.epics && milestone.epics.length > 0 ? (
              <div className="space-y-2">
                {milestone.epics.map((epic: any) => (
                  <RelationItem
                    key={epic.id}
                    title={epic.title}
                    type="epic"
                    status={epic.status}
                    href={currentWorkspace ? 
                      (currentWorkspace.slug && epic.issueKey 
                        ? `/${currentWorkspace.slug}/epics/${epic.issueKey}`
                        : `/${currentWorkspace.id}/epics/${epic.id}`
                      ) : "#"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No epics linked
              </div>
            )}
          </div>

          {/* Stories (through epics) */}
          <div>
            <h4 className="text-sm font-medium mb-2">Stories</h4>
            {milestone.epics && milestone.epics.some((epic: any) => epic.stories?.length > 0) ? (
              <div className="space-y-2">
                {milestone.epics.flatMap((epic: any) => 
                  epic.stories?.map((story: any) => (
                    <RelationItem
                      key={story.id}
                      title={`${story.title} (via ${epic.title})`}
                      type="story"
                      status={story.status}
                      href={currentWorkspace ? 
                        (currentWorkspace.slug && story.issueKey 
                          ? `/${currentWorkspace.slug}/stories/${story.issueKey}`
                          : `/${currentWorkspace.id}/stories/${story.id}`
                        ) : "#"}
                    />
                  )) || []
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No stories linked
              </div>
            )}
          </div>

          {/* Tasks (through epics) */}
          <div>
            <h4 className="text-sm font-medium mb-2">Tasks</h4>
            {milestone.epics && milestone.epics.some((epic: any) => epic.tasks?.length > 0) ? (
              <div className="space-y-2">
                {milestone.epics.flatMap((epic: any) => 
                  epic.tasks?.map((task: any) => (
                    <RelationItem
                      key={task.id}
                      title={`${task.title} (via ${epic.title})`}
                      type="task"
                      issueKey={task.issueKey}
                      status={task.status}
                      href={currentWorkspace ? 
                        (currentWorkspace.slug && task.issueKey 
                          ? `/${currentWorkspace.slug}/tasks/${task.issueKey}`
                          : `/${currentWorkspace.id}/tasks/${task.id}`
                        ) : "#"}
                    />
                  )) || []
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                No tasks linked
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Main Relations component that renders the appropriate relations based on item type
interface RelationsSectionProps {
  itemType: 'task' | 'epic' | 'story' | 'milestone';
  itemData: any;
}

export function RelationsSection({ itemType, itemData }: RelationsSectionProps) {
  switch (itemType) {
    case 'task':
      return <TaskRelations task={itemData} />;
    case 'epic':
      return <EpicRelations epic={itemData} />;
    case 'story':
      return <StoryRelations story={itemData} />;
    case 'milestone':
      return <MilestoneRelations milestone={itemData} />;
    default:
      return null;
  }
} 