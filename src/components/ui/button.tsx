import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary - Semi-transparent blue (like "New Context" button)
        default:
          "bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/20 hover:border-[#3b82f6]/30",
        // Solid primary - for high emphasis actions
        primary:
          "bg-[#3b82f6] hover:bg-[#2563eb] text-white border border-transparent",
        // Destructive - Semi-transparent red
        destructive:
          "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30",
        // Destructive solid - for dangerous actions needing high visibility
        "destructive-solid":
          "bg-red-500 hover:bg-red-600 text-white border border-transparent",
        // Outline - subtle border, transparent bg
        outline:
          "border border-[#27272a] bg-transparent hover:bg-[#1f1f1f] hover:border-[#3f3f46] text-[#a1a1aa] hover:text-[#e6edf3]",
        // Secondary - dark bg with subtle styling
        secondary:
          "bg-[#1f1f1f] hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#e6edf3] border border-[#27272a] hover:border-[#3f3f46]",
        // Ghost - no border, transparent bg until hover
        ghost:
          "hover:bg-[#1f1f1f] text-[#a1a1aa] hover:text-[#e6edf3]",
        // Link - text only with underline
        link:
          "text-[#3b82f6] underline-offset-4 hover:underline bg-transparent",
        // Success - Semi-transparent green
        success:
          "bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 hover:border-green-500/30",
        // Warning - Semi-transparent amber
        warning:
          "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/30",
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
