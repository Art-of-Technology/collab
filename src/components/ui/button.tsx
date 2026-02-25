import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary - Semi-transparent blue (like "New Context" button)
        default:
          "bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/20 hover:border-blue-500/30",
        // Solid primary - for high emphasis actions
        primary:
          "bg-blue-500 hover:bg-blue-600 text-white border border-transparent",
        // Destructive - Semi-transparent red
        destructive:
          "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30",
        // Destructive solid - for dangerous actions needing high visibility
        "destructive-solid":
          "bg-red-500 hover:bg-red-600 text-white border border-transparent",
        // Outline - subtle border, transparent bg
        outline:
          "border border-collab-600 bg-transparent hover:bg-collab-700 hover:border-collab-600 text-collab-400 hover:text-collab-50",
        // Secondary - dark bg with subtle styling
        secondary:
          "bg-collab-700 hover:bg-collab-600 text-collab-400 hover:text-collab-50 border border-collab-600 hover:border-collab-600",
        // Ghost - no border, transparent bg until hover
        ghost:
          "hover:bg-collab-700 text-collab-400 hover:text-collab-50",
        // Link - text only with underline
        link:
          "text-blue-500 underline-offset-4 hover:underline bg-transparent",
        // Success - Semi-transparent green
        success:
          "bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 hover:border-green-500/30",
        // Warning - Semi-transparent amber
        warning:
          "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/30",
        // AI Primary - Semi-transparent purple for AI actions
        ai:
          "bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 border border-violet-500/20 hover:border-violet-500/30",
        // AI Solid - for prominent AI actions
        "ai-solid":
          "bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white border border-transparent shadow-lg shadow-purple-500/20",
        // AI Ghost - subtle AI styling
        "ai-ghost":
          "hover:bg-violet-500/10 text-collab-400 hover:text-violet-300",
        // AI Suggestion - dashed border for suggested actions
        "ai-suggestion":
          "bg-violet-500/5 hover:bg-violet-500/10 text-violet-300 border border-dashed border-violet-500/30 hover:border-violet-500/50",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 rounded-md px-3 text-xs",
        md: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
        "icon-xs": "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
