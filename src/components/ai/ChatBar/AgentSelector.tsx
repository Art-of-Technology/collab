"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useAIAgents } from "@/hooks/useAI";

export default function AgentSelector() {
  const { currentAgent, availableAgents, setCurrentAgent } = useAIAgents();

  if (!currentAgent || availableAgents.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {availableAgents.map((agent) => {
        const isSelected = currentAgent.slug === agent.slug;
        return (
          <button
            key={agent.slug}
            onClick={() => setCurrentAgent(agent.slug)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium",
              "transition-all duration-200",
              isSelected
                ? "bg-white/[0.08] text-white/70 border border-white/[0.1]"
                : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]",
            )}
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                backgroundColor: agent.color,
                boxShadow: isSelected ? `0 0 8px ${agent.color}40` : undefined,
              }}
            />
            <span>{agent.name}</span>
          </button>
        );
      })}
    </div>
  );
}
