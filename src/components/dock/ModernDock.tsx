"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface DockItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  content?: React.ReactNode;
  badge?: number;
  onClick?: () => void;
}

export interface DockProps {
  items: DockItem[];
  leftContent?: React.ReactNode;
  className?: string;
}

const DOCK_HEIGHT = 48;
const ICON_SIZE = 28;

export function ModernDock({ items, leftContent, className }: DockProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  
  const dockRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleItemClick = useCallback((item: DockItem) => {
    if (item.content) {
      setActiveItem(activeItem === item.id ? null : item.id);
    }
    item.onClick?.();
  }, [activeItem]);

  return (
    <TooltipProvider>
      <motion.div
        ref={dockRef}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1]
        }}
        className={cn(
          "fixed bottom-4 left-0 right-0 mx-auto z-50 w-max",
          "bg-black/40 backdrop-blur-xl border border-white/10",
          "rounded-2xl shadow-2xl",
          "transition-all duration-300 ease-out",
          isHovered && "bg-black/60 border-white/20 shadow-3xl",
          className
        )}
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
            {/* Compact inner container */}
            <motion.div
              className="flex items-center px-2 py-1"
            >
              {/* Left content (ActivityStatusWidget) */}
              {leftContent && (
                <>
                  <div className="flex items-center">
                    {leftContent}
                  </div>
                  
                  {/* Compact separator */}
                  <div className="mx-2 h-6 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
                </>
              )}

              {/* Main dock items */}
              <div className="flex items-center space-x-1">
                {items.map((item, index) => (
                  <DockItemComponent
                    key={item.id}
                    item={item}
                    index={index}
                    isActive={activeItem === item.id}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </div>
            </motion.div>

            {/* Expanded content area */}
            <AnimatePresence>
              {activeItem && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1]
                  }}
                  className="border-t border-white/10 overflow-hidden"
                >
                  <div className="p-3 max-w-md">
                    {items.find(item => item.id === activeItem)?.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
        </motion.div>
    </TooltipProvider>
  );
}

interface DockItemProps {
  item: DockItem;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

function DockItemComponent({ item, index, isActive, onClick }: DockItemProps) {

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          className={cn(
            "relative flex items-center justify-center rounded-lg w-7 h-7",
            "transition-all duration-200 ease-out",
            "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20",
            isActive && "bg-white/20 shadow-lg ring-2 ring-white/30"
          )}
          onClick={onClick}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: 1,
          }}
          transition={{ 
            delay: index * 0.05,
            duration: 0.2
          }}
        >
          {/* Icon */}
          <div className="text-white">
            {item.icon}
          </div>

          {/* Badge */}
          {item.badge && item.badge > 0 && (
            <div className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full flex items-center justify-center text-[10px] font-medium text-white">
              {item.badge > 99 ? '99+' : item.badge}
            </div>
          )}

          {/* Active indicator */}
          {isActive && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
          )}
        </motion.button>
      </TooltipTrigger>
      
      <TooltipContent 
        side="top" 
        className="bg-black/90 text-white border-white/20 backdrop-blur-sm"
        sideOffset={8}
      >
        <div className="flex items-center gap-2">
          {item.title}
          {item.badge && item.badge > 0 && (
            <span className="text-xs text-gray-400">({item.badge})</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}