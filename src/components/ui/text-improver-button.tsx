"use client";

import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CoolMode } from "@/components/magicui/cool-mode";

interface TextImproverButtonProps {
  text: string;
  onImprovedText: (improvedText: string) => void;
  maxLength?: number;
  disabled?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

export function TextImproverButton({
  text,
  onImprovedText,
  maxLength = 1000,
  disabled = false,
  size = "default",
  className = "",
}: TextImproverButtonProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const improveText = async () => {
    if (!text.trim()) {
      toast({
        title: "Error",
        description: "Text is required",
        variant: "destructive"
      });
      return;
    }

    if (maxLength && text.length > maxLength) {
      toast({
        title: "Error",
        description: `Text is too long. Max ${maxLength} characters`,
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to improve text");
      }

      const data = await response.json();
      onImprovedText(data.message);

      toast({
        title: "Success",
        description: "Text improved successfully",
      });
    } catch (error) {
      console.error("Text improvement error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to improve text",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Determine button size
  const btnSize = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-9 w-9" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <CoolMode>
      <Button
        type="button"
        disabled={disabled || isLoading || !text.trim()}
        className={`bg-secondary hover:bg-primary/90 transition-colors relative aspect-square ${btnSize} ${className}`}
        onClick={improveText}
        title="Improve text with AI"
      >
        {!isLoading && <WandSparkles className={iconSize} />}
        
        {isLoading && <span className="animate-spin">
          <svg className={iconSize} fill="white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30">
            <path d="M 14.070312 2 C 11.330615 2 8.9844456 3.7162572 8.0390625 6.1269531 C 6.061324 6.3911222 4.2941948 7.5446684 3.2773438 9.3066406 C 1.9078196 11.678948 2.2198602 14.567816 3.8339844 16.591797 C 3.0745422 18.436097 3.1891418 20.543674 4.2050781 22.304688 C 5.5751778 24.677992 8.2359331 25.852135 10.796875 25.464844 C 12.014412 27.045167 13.895916 28 15.929688 28 C 18.669385 28 21.015554 26.283743 21.960938 23.873047 C 23.938676 23.608878 25.705805 22.455332 26.722656 20.693359 C 28.09218 18.321052 27.78014 15.432184 26.166016 13.408203 C 26.925458 11.563903 26.810858 9.4563257 25.794922 7.6953125 C 24.424822 5.3220082 21.764067 4.1478652 19.203125 4.5351562 C 17.985588 2.9548328 16.104084 2 14.070312 2 z" />
          </svg>
        </span>}
      </Button>
    </CoolMode>
  );
} 