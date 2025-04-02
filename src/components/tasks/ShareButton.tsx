"use client";

import { Button } from "@/components/ui/button";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Share2, Check, Copy } from "lucide-react";
import { useState } from "react";

export interface ShareButtonProps {
  taskId: string;
  issueKey: string;
}

export function ShareButton({ taskId, issueKey }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopyLink = () => {
    // Use issue key if available, otherwise use task ID
    const url = `${window.location.origin}/tasks/${issueKey || taskId}`;
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