"use client";

export function LoadingState(props: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  noPadding?: boolean;
}) {
  const { size = "md", className = "", noPadding = false } = props;
  
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
    xl: "h-12 w-12"
  };

  const containerClasses = noPadding ? "flex items-center justify-center" : "flex items-center justify-center py-8";

  return (
    <div className={containerClasses}>
      <div className={`animate-spin rounded-full border-b-2 border-blue-500 ${sizeClasses[size]} ${className}`}></div>
    </div>
  );
}
