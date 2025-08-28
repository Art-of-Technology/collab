"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, 
  FolderOpen, 
  Clock, 
  FileText, 
  Menu, 
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useSidebar } from '@/components/providers/SidebarProvider';
import { useRouter, usePathname } from 'next/navigation';

export interface MobileNavItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
  isActive?: boolean;
}

interface MobileBottomNavProps {
  className?: string;
  onOpenCommandMenu?: () => void;
}

export function MobileBottomNav({ className, onOpenCommandMenu }: MobileBottomNavProps) {
  const { currentWorkspace } = useWorkspace();
  const { toggleMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);

  // Primary navigation items for the bottom nav
  const primaryNavItems: MobileNavItem[] = [
    {
      id: 'sidebar-toggle',
      icon: <Menu className="h-4 w-4" />,
      title: 'Menu',
      onClick: toggleMobile,
    },
    {
      id: 'views',
      icon: <Eye className="h-4 w-4" />,
      title: 'All Views',
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/views` : "#",
      isActive: pathname.includes('/views'),
    },
    {
      id: 'projects',
      icon: <FolderOpen className="h-4 w-4" />,
      title: 'All Projects',
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/projects` : "#",
      isActive: pathname.includes('/projects'),
    },
    {
      id: 'posts',
      icon: <Clock className="h-4 w-4" />,
      title: 'Posts',
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/timeline` : "#",
      isActive: pathname.includes('/timeline'),
    },
    {
      id: 'notes',
      icon: <FileText className="h-4 w-4" />,
      title: 'Notes',
      href: currentWorkspace ? `/${currentWorkspace.slug || currentWorkspace.id}/notes` : "#",
      isActive: pathname.includes('/notes'),
    },
    {
      id: 'search',
      icon: <Search className="h-4 w-4" />,
      title: 'Search',
      onClick: onOpenCommandMenu,
    },
  ];

  const handleItemClick = (item: MobileNavItem) => {
    if (item.onClick) {
      item.onClick();
    } else if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <TooltipProvider>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1]
        }}
        className={cn(
          "fixed bottom-4 left-0 right-0 mx-auto z-50 w-max md:hidden",
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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div className="flex items-center px-2 py-1">
          {/* Primary navigation items */}
          <div className="flex items-center space-x-1">
            {primaryNavItems.map((item, index) => (
              <MobileNavItemComponent
                key={item.id}
                item={item}
                index={index}
                onClick={() => handleItemClick(item)}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </TooltipProvider>
  );
}

interface MobileNavItemComponentProps {
  item: MobileNavItem;
  index: number;
  onClick: () => void;
}

function MobileNavItemComponent({ item, index, onClick }: MobileNavItemComponentProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          className={cn(
            "relative flex items-center justify-center rounded-lg w-7 h-7",
            "transition-all duration-200 ease-out",
            "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20",
            item.isActive && "bg-white/20 shadow-lg ring-2 ring-white/30"
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
          {item.isActive && (
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
