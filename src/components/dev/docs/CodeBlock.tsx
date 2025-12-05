'use client';

import { useState } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={handleCopy}
          className="text-xs px-2 py-1 bg-[#1f1f1f] text-gray-300 hover:text-white rounded border border-[#2a2a2a] transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="bg-[#090909] border border-[#1f1f1f] rounded-lg p-4 overflow-x-auto text-sm whitespace-pre-wrap break-words">
        <code className="text-gray-300">{code}</code>
      </pre>
    </div>
  );
}

