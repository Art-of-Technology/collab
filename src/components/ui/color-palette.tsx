"use client";

import React from "react";

interface InlineColorPaletteProps {
  value?: string;
  onChange?: (color: string) => void;
  onClose?: () => void;
}

const PRESET_COLORS = [
  // Whites & Blacks
  { name: "White", value: "#ffffff", rgba: "rgba(255, 255, 255, 1)" },
  { name: "Black", value: "#000000", rgba: "rgba(0, 0, 0, 1)" },
  
  // Reds
  { name: "Red", value: "#ef4444", rgba: "rgba(239, 68, 68, 1)" },
  { name: "Rose", value: "#f43f5e", rgba: "rgba(244, 63, 94, 1)" },
  { name: "Pink", value: "#ec4899", rgba: "rgba(236, 72, 153, 1)" },
  { name: "Crimson", value: "#dc2626", rgba: "rgba(220, 38, 38, 1)" },
  
  // Oranges
  { name: "Orange", value: "#f97316", rgba: "rgba(249, 115, 22, 1)" },
  { name: "Amber", value: "#f59e0b", rgba: "rgba(245, 158, 11, 1)" },
  { name: "Yellow", value: "#eab308", rgba: "rgba(234, 179, 8, 1)" },
  { name: "Gold", value: "#fbbf24", rgba: "rgba(251, 191, 36, 1)" },
  { name: "Peach", value: "#fde68a", rgba: "rgba(253, 230, 138, 1)" },
  
  // Greens
  { name: "Lime", value: "#84cc16", rgba: "rgba(132, 204, 22, 1)" },
  { name: "Green", value: "#22c55e", rgba: "rgba(34, 197, 94, 1)" },
  { name: "Emerald", value: "#10b981", rgba: "rgba(16, 185, 129, 1)" },
  { name: "Forest", value: "#15803d", rgba: "rgba(21, 128, 61, 1)" },
  
  // Blues
  { name: "Teal", value: "#14b8a6", rgba: "rgba(20, 184, 166, 1)" },
  { name: "Cyan", value: "#06b6d4", rgba: "rgba(6, 182, 212, 1)" },
  { name: "Sky", value: "#0ea5e9", rgba: "rgba(14, 165, 233, 1)" },
  { name: "Blue", value: "#3b82f6", rgba: "rgba(59, 130, 246, 1)" },
  { name: "Indigo", value: "#6366f1", rgba: "rgba(99, 102, 241, 1)" },
  { name: "Navy", value: "#1e40af", rgba: "rgba(30, 64, 175, 1)" },
  
  // Purples
  { name: "Violet", value: "#8b5cf6", rgba: "rgba(139, 92, 246, 1)" },
  { name: "Purple", value: "#a855f7", rgba: "rgba(168, 85, 247, 1)" },
  { name: "Fuchsia", value: "#d946ef", rgba: "rgba(217, 70, 239, 1)" },
  { name: "Magenta", value: "#be185d", rgba: "rgba(190, 24, 93, 1)" },
  
  // Grays
  { name: "Slate", value: "#64748b", rgba: "rgba(100, 116, 139, 1)" },
  { name: "Gray", value: "#6b7280", rgba: "rgba(107, 114, 128, 1)" },
  { name: "Zinc", value: "#71717a", rgba: "rgba(113, 113, 122, 1)" },
  { name: "Neutral", value: "#737373", rgba: "rgba(115, 115, 115, 1)" },
  { name: "Stone", value: "#78716c", rgba: "rgba(120, 113, 108, 1)" },
];

export function InlineColorPalette({ 
  value = "rgba(59, 130, 246, 1)", 
  onChange, 
  onClose 
}: InlineColorPaletteProps) {
  
  const handleColorSelect = (colorRgba: string) => {
    onChange?.(colorRgba);
    onClose?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Select Color</label>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>
      
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">
          Preset Colors
        </label>
        <div className="grid grid-cols-6 gap-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color.rgba}
              className="w-9 h-9 rounded border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
              style={{
                backgroundColor: color.value,
                borderColor: value === color.rgba ? '#3b82f6' : '#e5e7eb',
                boxShadow: value === color.rgba ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none'
              }}
              onClick={() => handleColorSelect(color.rgba)}
              title={color.name}
              aria-label={`Select ${color.name} color`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}