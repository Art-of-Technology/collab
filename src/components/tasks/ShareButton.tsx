"use client";

import { Button } from "@/components/ui/button";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Share2, Check } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";

export interface ShareButtonProps {
  entityId: string;
  issueKey: string;
  entityType: 'tasks' | 'epics' | 'stories' | 'milestones';
}

export function ShareButton({ entityId, issueKey, entityType }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const { currentWorkspace } = useWorkspace();
  
  const handleCopyLink = () => {
    // Generate URL with workspace slug if available, fallback to workspace ID
    const workspaceIdentifier = currentWorkspace?.slug || currentWorkspace?.id;
    const entityIdentifier = issueKey || entityId;
    
    const url = workspaceIdentifier 
      ? `${window.location.origin}/${workspaceIdentifier}/${entityType}/${entityIdentifier}`
      : `${window.location.origin}/${entityType}/${entityIdentifier}`;
      
    navigator.clipboard.writeText(url);
    setCopied(true);
    
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopyLink}
            className="flex items-center gap-1"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                Share
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? "Copied to clipboard!" : "Copy link to clipboard"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 