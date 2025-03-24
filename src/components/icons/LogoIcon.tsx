import React from 'react';

interface LogoIconProps {
  className?: string;
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg 
      className={className}
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M20 12V5.749C20 5.335 19.664 5 19.25 5H12.75C12.336 5 12 5.335 12 5.749V19.25C12 19.664 12.336 20 12.75 20H19.25C19.664 20 20 19.664 20 19.25V19"
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d="M4 12V5.749C4 5.335 4.336 5 4.75 5H8.25C8.664 5 9 5.335 9 5.749V19.25C9 19.664 8.664 20 8.25 20H4.75C4.336 20 4 19.664 4 19.25V19"
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d="M4 12H20"
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
} 