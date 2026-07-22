'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  code: string;
}

export function CodeBlock({ code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: try using execCommand for older browsers
      try {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackError) {
        console.error('Fallback copy method also failed:', fallbackError);
      }
    }
  };

  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 z-10">
        <Button
          variant="ghost"
          onClick={handleCopy}
          className="text-xs h-auto px-2 py-1 bg-collab-700 text-gray-300 hover:text-white rounded border border-collab-600 hover:bg-collab-600"
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <pre className="bg-collab-950 border border-collab-700 rounded-lg p-4 overflow-x-auto text-sm whitespace-pre-wrap break-words">
        <code className="text-gray-300">{code}</code>
      </pre>
    </div>
  );
}

