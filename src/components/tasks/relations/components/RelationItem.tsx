"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import Link from "next/link";
import { RelationItemProps } from '../types';

export function RelationItem({ 
  title, 
  type, 
  issueKey, 
  status, 
  href, 
  onRemove, 
  canRemove = false 
}: RelationItemProps) {
  const getBadgeStyle = (type: string) => {
    const styles = {
      milestone: "bg-indigo-50 text-indigo-700 border-indigo-200",
      epic: "bg-purple-50 text-purple-700 border-purple-200",
      story: "bg-blue-50 text-blue-700 border-blue-200",
      task: "bg-gray-50 text-gray-700 border-gray-200"
    };
    return styles[type as keyof typeof styles] || styles.task;
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
    <div className="flex items-center justify-between gap-2 text-sm p-2 bg-muted/20 rounded-md hover:bg-muted/30 transition-colors">
      <Link href={href} className="flex items-center gap-2 min-w-0 flex-1">
        <Badge variant="outline" className={getBadgeStyle(type)}>
          {issueKey || type.charAt(0).toUpperCase() + type.slice(1)}
        </Badge>
        <span className="truncate">{title}</span>
        {getStatusBadge(status)}
      </Link>
      {canRemove && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}