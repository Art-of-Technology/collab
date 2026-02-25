"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  gradientBorder?: boolean;
}

export function GlassPanel({
  className,
  gradientBorder = false,
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "bg-collab-900 border border-collab-700 rounded-lg",
        gradientBorder && "gradient-border",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function GlassCard({
  className,
  hover = true,
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "bg-collab-900 border border-collab-700 rounded-lg transition-all duration-200",
        hover && "hover:bg-collab-800 hover:border-collab-600",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface GlowRingProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
  animate?: boolean;
  size?: "sm" | "md" | "lg";
}

export function GlowRing({
  color = "#8b5cf6",
  animate = true,
  size = "md",
  className,
  children,
  ...props
}: GlowRingProps) {
  const sizeMap = { sm: 2, md: 3, lg: 4 };
  const blurMap = { sm: 8, md: 12, lg: 20 };
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        animate && "animate-breathe",
        className
      )}
      style={{
        boxShadow: `0 0 0 ${sizeMap[size]}px ${color}40, 0 0 ${blurMap[size]}px ${color}25`,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

interface GradientTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  as?: "span" | "h1" | "h2" | "h3" | "h4" | "p";
}

export function GradientText({
  as: Tag = "span",
  className,
  children,
  ...props
}: GradientTextProps) {
  return (
    <Tag className={cn("gradient-text", className)} {...props}>
      {children}
    </Tag>
  );
}

interface PulseIndicatorProps {
  color?: string;
  size?: "sm" | "md";
  className?: string;
}

export function PulseIndicator({
  color = "#8b5cf6",
  size = "sm",
  className,
}: PulseIndicatorProps) {
  const dim = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  return (
    <span className={cn("relative inline-flex", className)}>
      <span
        className={cn(dim, "rounded-full animate-ping absolute opacity-40")}
        style={{ backgroundColor: color }}
      />
      <span
        className={cn(dim, "rounded-full relative")}
        style={{ backgroundColor: color }}
      />
    </span>
  );
}
