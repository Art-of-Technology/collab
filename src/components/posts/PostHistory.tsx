"use client";

import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  PlusCircle, 
  Edit3, 
  ArrowRightLeft, 
  AlertTriangle, 
  CheckCircle, 
  RotateCcw, 
  Trash2,
  Clock
} from "lucide-react";
import { usePostActions, type PostAction } from "@/hooks/queries/usePostActions";

interface PostHistoryProps {
  postId: string;
}

const getActionIcon = (action: PostAction['actionType']) => {
  switch (action) {
    case 'CREATED':
      return <PlusCircle className="h-4 w-4 text-green-500" />;
    case 'EDITED':
      return <Edit3 className="h-4 w-4 text-blue-500" />;
    case 'TYPE_CHANGED':
      return <ArrowRightLeft className="h-4 w-4 text-purple-500" />;
    case 'PRIORITY_CHANGED':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'RESOLVED':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'REOPENED':
      return <RotateCcw className="h-4 w-4 text-yellow-500" />;
    case 'DELETED':
      return <Trash2 className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
};

const getActionText = (action: PostAction) => {
  const userName = action.user_name || 'Unknown User';
  
  switch (action.actionType) {
    case 'CREATED':
      return `${userName} created this post`;
    case 'EDITED':
      return `${userName} edited the message`;
    case 'TYPE_CHANGED':
      const oldType = action.oldValue ? JSON.parse(action.oldValue).type : 'Unknown';
      const newType = action.newValue ? JSON.parse(action.newValue).type : 'Unknown';
      return `${userName} changed type from ${oldType} to ${newType}`;
    case 'PRIORITY_CHANGED':
      const oldPriority = action.oldValue ? JSON.parse(action.oldValue).priority : 'Unknown';
      const newPriority = action.newValue ? JSON.parse(action.newValue).priority : 'Unknown';
      return `${userName} changed priority from ${oldPriority} to ${newPriority}`;
    case 'RESOLVED':
      return `${userName} marked this blocker as resolved`;
    case 'REOPENED':
      return `${userName} reopened this post`;
    case 'DELETED':
      return `${userName} deleted this post`;
    default:
      return `${userName} performed an action`;
  }
};

const getActionBadgeVariant = (actionType: PostAction['actionType']) => {
  switch (actionType) {
    case 'CREATED':
      return 'default';
    case 'EDITED':
      return 'secondary';
    case 'TYPE_CHANGED':
    case 'PRIORITY_CHANGED':
      return 'outline';
    case 'RESOLVED':
      return 'default';
    case 'REOPENED':
      return 'secondary';
    case 'DELETED':
      return 'destructive';
    default:
      return 'outline';
  }
};

export default function PostHistory({ postId }: PostHistoryProps) {
  const { data: actions = [], isLoading, error } = usePostActions(postId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Post History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            Loading history...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Post History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            Failed to load history
          </div>
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Post History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            No history available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Post History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {actions.map((action, index) => (
            <div key={action.id}>
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={action.user_image || undefined} alt={action.user_name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {action.user_name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getActionIcon(action.actionType)}
                    <span className="text-sm font-medium">
                      {getActionText(action)}
                    </span>
                    <Badge variant={getActionBadgeVariant(action.actionType)} className="text-xs">
                      {action.actionType.replace('_', ' ')}
                    </Badge>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                  </div>
                  
                  {/* Show change details for edits */}
                  {action.actionType === 'EDITED' && action.oldValue && action.newValue && (
                    <div className="mt-2 p-2 bg-muted rounded-md text-xs">
                      <div className="font-medium mb-1">Changes:</div>
                      <div className="text-muted-foreground">
                        <span className="line-through">&quot;{JSON.parse(action.oldValue).message}&quot;</span>
                      </div>
                      <div>
                        &quot;{JSON.parse(action.newValue).message}&quot;
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {index < actions.length - 1 && (
                <Separator className="mt-4" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 