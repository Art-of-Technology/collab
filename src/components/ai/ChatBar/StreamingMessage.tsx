"use client";

import React from "react";
import { motion } from "framer-motion";
import InteractiveContentRenderer from "../InteractiveContentRenderer";

interface StreamingMessageProps {
  content: string;
  agentName?: string;
  agentColor?: string;
}

export default function StreamingMessage({
  content,
  agentName,
  agentColor = "#8b5cf6",
}: StreamingMessageProps) {
  if (!content.trim()) return null;

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {/* Agent avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
        style={{ backgroundColor: agentColor, boxShadow: `0 0 8px ${agentColor}30` }}
      >
        {agentName?.[0] || "A"}
      </div>

      {/* Streaming content */}
      <div className="flex-1 min-w-0 glass-subtle rounded-xl px-3 py-2">
        {agentName && (
          <span className="text-[10px] font-medium text-white/30 mb-1 block">
            {agentName}
          </span>
        )}
        <div className="text-sm text-white/80 leading-relaxed">
          <InteractiveContentRenderer content={content} />
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
            className="inline-block w-[2px] h-4 ml-0.5 align-middle"
            style={{ backgroundColor: agentColor, boxShadow: `0 0 6px ${agentColor}` }}
          />
        </div>
      </div>
    </div>
  );
}
