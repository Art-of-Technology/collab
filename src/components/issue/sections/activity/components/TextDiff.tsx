"use client";

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TextDiffProps {
  oldText: string;
  newText: string;
  maxHeight?: number;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified';
  oldLineNum?: number;
  newLineNum?: number;
  content: string;
  oldContent?: string; // For modified lines
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];
  
  let oldIndex = 0;
  let newIndex = 0;
  let oldLineNum = 1;
  let newLineNum = 1;
  
  // Simple line-by-line diff algorithm
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldIndex < oldLines.length ? oldLines[oldIndex] : null;
    const newLine = newIndex < newLines.length ? newLines[newIndex] : null;
    
    if (oldLine === null) {
      // Only new lines remain
      result.push({
        type: 'added',
        newLineNum: newLineNum++,
        content: newLine!
      });
      newIndex++;
    } else if (newLine === null) {
      // Only old lines remain
      result.push({
        type: 'removed',
        oldLineNum: oldLineNum++,
        content: oldLine
      });
      oldIndex++;
    } else if (oldLine === newLine) {
      // Lines are identical
      result.push({
        type: 'unchanged',
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
        content: oldLine
      });
      oldIndex++;
      newIndex++;
    } else {
      // Lines are different - look ahead to see if this is a modification or insertion/deletion
      const nextOldLine = oldIndex + 1 < oldLines.length ? oldLines[oldIndex + 1] : null;
      const nextNewLine = newIndex + 1 < newLines.length ? newLines[newIndex + 1] : null;
      
      // Simple heuristic: if the next lines match, treat current as modification
      if (nextOldLine === nextNewLine && nextOldLine !== null) {
        result.push({
          type: 'modified',
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
          content: newLine,
          oldContent: oldLine
        });
        oldIndex++;
        newIndex++;
      } else if (newLines.slice(newIndex + 1).includes(oldLine)) {
        // Old line appears later in new text - this is an addition
        result.push({
          type: 'added',
          newLineNum: newLineNum++,
          content: newLine
        });
        newIndex++;
      } else if (oldLines.slice(oldIndex + 1).includes(newLine)) {
        // New line appears later in old text - this is a removal
        result.push({
          type: 'removed',
          oldLineNum: oldLineNum++,
          content: oldLine
        });
        oldIndex++;
      } else {
        // Treat as modification
        result.push({
          type: 'modified',
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
          content: newLine,
          oldContent: oldLine
        });
        oldIndex++;
        newIndex++;
      }
    }
  }
  
  return result;
}

function stripHtmlTags(html: string): string {
  if (typeof window !== 'undefined') {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Get text content and preserve line breaks
    let textContent = '';
    const walker = document.createTreeWalker(
      tempDiv,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        textContent += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        // Add line breaks for block elements
        if (['DIV', 'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'].includes(element.tagName)) {
          if (element.tagName === 'BR') {
            textContent += '\n';
          } else if (textContent && !textContent.endsWith('\n')) {
            textContent += '\n';
          }
        }
      }
    }
    
    return textContent;
  }
  
  // Server-side fallback - convert common HTML line breaks to newlines
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n\s*\n/g, '\n') // Remove extra empty lines
    .trim();
}

export function TextDiff({ oldText, newText, maxHeight = 200 }: TextDiffProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Clean the text content and normalize line breaks
  let cleanOldText = stripHtmlTags(oldText)
    .replace(/\r\n/g, '\n') // Windows line breaks
    .replace(/\r/g, '\n')   // Mac line breaks
    .trim();
    
  let cleanNewText = stripHtmlTags(newText)
    .replace(/\r\n/g, '\n') // Windows line breaks  
    .replace(/\r/g, '\n')   // Mac line breaks
    .trim();
  
  // If no line breaks found but text looks like it should have some,
  // try to detect potential line breaks based on patterns
  if (!cleanOldText.includes('\n') && cleanOldText.length > 80) {
    // Look for sentence endings that might indicate line breaks
    cleanOldText = cleanOldText
      .replace(/\.\s+([A-Z])/g, '.\n$1') // Period followed by capital letter
      .replace(/!\s+([A-Z])/g, '!\n$1')  // Exclamation followed by capital letter
      .replace(/\?\s+([A-Z])/g, '?\n$1'); // Question mark followed by capital letter
  }
  
  if (!cleanNewText.includes('\n') && cleanNewText.length > 80) {
    cleanNewText = cleanNewText
      .replace(/\.\s+([A-Z])/g, '.\n$1')
      .replace(/!\s+([A-Z])/g, '!\n$1')
      .replace(/\?\s+([A-Z])/g, '?\n$1');
  }
  
  // If texts are identical, don't show diff
  if (cleanOldText === cleanNewText) {
    return null;
  }
  
  const diffLines = computeDiff(cleanOldText, cleanNewText);
  
  // Count changes for summary
  const changedLines = diffLines.filter(line => line.type !== 'unchanged').length;
  
  // Determine if we should show compact view
  const hasSignificantChanges = changedLines > 0;
  
  if (!hasSignificantChanges) {
    return null;
  }
  
  return (
    <div className="mt-2 border border-[#2d2d30] rounded-md overflow-hidden bg-[#0a0a0a]">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 bg-[#1a1a1a] border-b border-[#2d2d30] cursor-pointer hover:bg-[#1f1f1f] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-xs text-[#8b949e]">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span>Description changes</span>
          <span className="text-[#666]">
            ({changedLines} {changedLines === 1 ? 'line' : 'lines'} changed)
          </span>
        </div>
      </div>
      
      {/* Diff content */}
      {isExpanded && (
        <div 
          className="overflow-auto text-xs font-mono"
          style={{ maxHeight: `${maxHeight}px` }}
        >
          {diffLines.map((line, index) => (
            <div
              key={index}
              className={`flex ${
                line.type === 'added' 
                  ? 'bg-[#0d4711] border-l-2 border-l-[#238636]' 
                  : line.type === 'removed'
                  ? 'bg-[#53212b] border-l-2 border-l-[#f85149]'
                  : line.type === 'modified'
                  ? 'bg-[#3d2a00] border-l-2 border-l-[#d29922]'
                  : 'hover:bg-[#0d0d0d]'
              }`}
            >
              {/* Line numbers */}
              <div className="flex-shrink-0 w-16 px-2 py-1 text-[#6e7681] text-right bg-[#0d1117] border-r border-[#2d2d30]">
                <div className="flex justify-between text-[10px]">
                  <span>{line.oldLineNum || ''}</span>
                  <span>{line.newLineNum || ''}</span>
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 px-3 py-1">
                {line.type === 'modified' && line.oldContent ? (
                  <div>
                    <div className="text-[#f85149] line-through opacity-70">
                      - {line.oldContent}
                    </div>
                    <div className="text-[#56d364]">
                      + {line.content}
                    </div>
                  </div>
                ) : (
                  <div className={`${
                    line.type === 'added' ? 'text-[#56d364]' :
                    line.type === 'removed' ? 'text-[#f85149]' :
                    'text-[#c9d1d9]'
                  }`}>
                    {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                    {line.content}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Compact preview when collapsed */}
      {!isExpanded && (
        <div className="px-3 py-2 text-xs">
          <div className="space-y-1">
            {diffLines
              .filter(line => line.type !== 'unchanged')
              .slice(0, 3)
              .map((line, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 ${
                    line.type === 'added' ? 'text-[#56d364]' :
                    line.type === 'removed' ? 'text-[#f85149]' :
                    'text-[#d29922]'
                  }`}
                >
                  <span className="flex-shrink-0 w-4">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : '~'}
                  </span>
                  <span className="truncate">
                    {line.type === 'modified' ? line.content : line.content}
                  </span>
                </div>
              ))}
            {changedLines > 3 && (
              <div className="text-[#6e7681] italic">
                and {changedLines - 3} more {changedLines - 3 === 1 ? 'change' : 'changes'}...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
