"use client";

import { cva, type VariantProps } from "class-variance-authority";
import {
  motion,
  MotionProps,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from "motion/react";
import React, { PropsWithChildren, useRef, useState, useCallback, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DockProps extends VariantProps<typeof dockVariants> {
  className?: string;
  iconSize?: number;
  iconMagnification?: number;
  iconDistance?: number;
  direction?: "top" | "middle" | "bottom";
  children: React.ReactNode;
  expandable?: boolean;
  fixed?: boolean;
  leftContent?: React.ReactNode;
}

export interface DockWidgetProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
  onActivate?: () => void;
}

const DEFAULT_SIZE = 40;
const DEFAULT_MAGNIFICATION = 60;
const DEFAULT_DISTANCE = 140;

const dockVariants = cva(
  "supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10 flex items-center justify-center border-t backdrop-blur-md h-[90px]",
  {
    variants: {
      position: {
        default: "mt-8 mx-auto rounded-2xl w-max gap-2 justify-center p-3",
        fixed: "fixed bottom-0 left-0 right-0 z-40 w-full px-6 py-4 gap-6 justify-center",
      }
    },
    defaultVariants: {
      position: "default",
    }
  }
);

const Dock = React.forwardRef<HTMLDivElement, DockProps>(
  (
    {
      className,
      children,
      iconSize = DEFAULT_SIZE,
      iconMagnification = DEFAULT_MAGNIFICATION,
      iconDistance = DEFAULT_DISTANCE,
      direction = "middle",
      expandable = false,
      fixed = false,
      leftContent,
      ...props
    },
    ref,
  ) => {
    const mouseX = useMotionValue(Infinity);
    const [activeWidget, setActiveWidget] = useState<string | null>(null);
    const [widgets, setWidgets] = useState<DockWidgetProps[]>([]);

    // Extract widgets from children on mount and when children change
    useEffect(() => {
      if (!expandable) return;

      const extractedWidgets: DockWidgetProps[] = [];
      React.Children.forEach(children, (child) => {
        if (React.isValidElement(child) && child.type === DockWidget) {
          const widget = child.props as DockWidgetProps;
          extractedWidgets.push(widget);
        }
      });

      setWidgets(extractedWidgets);
    }, [children, expandable]);

    const activateWidget = useCallback((widgetId: string) => {
      setActiveWidget(widgetId);
      const widget = widgets.find(w => w.id === widgetId);
      if (widget?.onActivate) {
        widget.onActivate();
      }
    }, [widgets]);

    const deactivateWidget = useCallback(() => {
      setActiveWidget(null);
    }, []);



    const renderChildren = () => {
      if (!expandable) {
        return React.Children.map(children, (child) => {
          if (
            React.isValidElement<DockIconProps>(child) &&
            child.type === DockIcon
          ) {
            return React.cloneElement(child, {
              ...child.props,
              mouseX: mouseX,
              size: iconSize,
              magnification: iconMagnification,
              distance: iconDistance,
            });
          }
          return child;
        });
      }

      return null; // For expandable docks, widgets are rendered separately
    };

    if (expandable) {
      return (
        <TooltipProvider>
          <motion.div
            ref={ref}
            {...props}
            className={cn(dockVariants({ 
              position: fixed ? "fixed" : "default",
              className 
            }), {
              "items-start": direction === "top",
              "items-center": direction === "middle",
              "items-end": direction === "bottom",
            })}
            layout
            transition={{
              layout: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
            }}
          >
          {/* Content Container - Centered */}
          <div className="flex items-center justify-center w-full">
            {/* Left side - Always visible content (Activity Tracker) */}
            <div className="flex items-center">
              {leftContent}
            </div>

            {/* Vertical Divider */}
            <div className="h-12 w-px bg-white/20 mx-6" />

            {/* Right side - Dynamic widgets */}
            <div className="flex items-center relative">
              {/* Always visible icons */}
              <motion.div 
                className="flex items-center gap-4"
                onMouseMove={(e) => mouseX.set(e.pageX)}
                onMouseLeave={() => mouseX.set(Infinity)}
                layout
                transition={{
                  layout: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
                }}
              >
                {widgets.map((widget, index) => {
                  const isActive = activeWidget === widget.id;
                  
                  return (
                    <motion.div
                      key={widget.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ 
                        opacity: 1, 
                        scale: 1
                      }}
                      transition={{ 
                        delay: index * 0.1,
                        duration: 0.4,
                        ease: [0.4, 0, 0.2, 1]
                      }}
                      className="flex items-center"
                      layout
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DockIcon
                            onClick={() => isActive ? deactivateWidget() : activateWidget(widget.id)}
                            mouseX={mouseX}
                            size={iconSize}
                            magnification={iconMagnification}
                            distance={iconDistance}
                            className={`text-white transition-all duration-200 ${
                              isActive 
                                ? "bg-white/20 shadow-lg ring-2 ring-white/30" 
                                : "hover:bg-white/10"
                            }`}
                          >
                            {widget.icon}
                          </DockIcon>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-black/90 text-white border-white/20 backdrop-blur-sm">
                          {widget.title}
                        </TooltipContent>
                      </Tooltip>
                      
                      {/* Expanded content that flows inline */}
                      <AnimatePresence>
                        {isActive && (
                          <motion.div
                            initial={{ 
                              opacity: 0, 
                              width: 0,
                              marginLeft: 0
                            }}
                            animate={{ 
                              opacity: 1, 
                              width: "auto",
                              marginLeft: 16
                            }}
                            exit={{ 
                              opacity: 0, 
                              width: 0,
                              marginLeft: 0
                            }}
                            transition={{ 
                              duration: 0.3,
                              ease: [0.4, 0, 0.2, 1],
                            }}
                            className="flex items-center overflow-hidden whitespace-nowrap"
                            layout
                          >
                            <motion.button
                              onClick={deactivateWidget}
                              className="flex-shrink-0 p-1.5 hover:bg-white/10 rounded-full transition-all duration-200 text-white/60 hover:text-white/80 mr-2"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <ArrowLeft className="h-3 w-3" />
                            </motion.button>
                            <div className="flex-shrink-0">
                              {widget.content}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </motion.div>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider>
        <motion.div
          ref={ref}
          onMouseMove={(e) => mouseX.set(e.pageX)}
          onMouseLeave={() => mouseX.set(Infinity)}
          {...props}
          className={cn(dockVariants({ 
            position: fixed ? "fixed" : "default",
            className 
          }), {
            "items-start": direction === "top",
            "items-center": direction === "middle",
            "items-end": direction === "bottom",
          })}
        >
          <div 
            className="flex items-center gap-2"
            style={{
              minWidth: 'max-content',
              transformOrigin: 'center'
            }}
          >
            {renderChildren()}
          </div>
        </motion.div>
      </TooltipProvider>
    );
  },
);

Dock.displayName = "Dock";

export interface DockIconProps
  extends Omit<MotionProps & React.HTMLAttributes<HTMLDivElement>, "children"> {
  size?: number;
  magnification?: number;
  distance?: number;
  mouseX?: MotionValue<number>;
  className?: string;
  children?: React.ReactNode;
  props?: PropsWithChildren;
}

const DockIcon = ({
  size = DEFAULT_SIZE,
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  mouseX,
  className,
  children,
  ...props
}: DockIconProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const padding = Math.max(6, size * 0.2);
  const defaultMouseX = useMotionValue(Infinity);

  const distanceCalc = useTransform(mouseX ?? defaultMouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const sizeTransform = useTransform(
    distanceCalc,
    [-distance, 0, distance],
    [size, magnification, size],
  );

  const scaleSize = useSpring(sizeTransform, {
    mass: 0.1,
    stiffness: 180,
    damping: 15,
  });

  return (
    <motion.div
      ref={ref}
      style={{ width: scaleSize, height: scaleSize, padding }}
      className={cn(
        "flex aspect-square cursor-pointer items-center justify-center rounded-full",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};

DockIcon.displayName = "DockIcon";

// New DockWidget component for expandable content
export interface DockWidgetComponentProps extends DockWidgetProps {}

const DockWidget: React.FC<DockWidgetComponentProps> = (props) => {
  // This component is used for registration only, actual rendering is handled by Dock
  return null;
};

DockWidget.displayName = "DockWidget";

export { Dock, DockIcon, DockWidget, dockVariants };
