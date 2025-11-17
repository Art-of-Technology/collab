"use client";

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Edit2, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { TeamMemberSync, IssueActivity } from '@/utils/teamSyncAnalyzer';

interface SplitUserCardProps {
  member: TeamMemberSync;
  workspaceSlug: string;
  editable?: boolean;
  onSaveAnnotations?: (annotations: any) => void;
}

export function SplitUserCard({
  member,
  workspaceSlug,
  editable = true,
  onSaveAnnotations,
}: SplitUserCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingIssue, setEditingIssue] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Map<string, { notes: string; symbol?: string }>>(
    new Map()
  );

  const handleSaveNote = (issueId: string, notes: string) => {
    const newAnnotations = new Map(annotations);
    const existing = newAnnotations.get(issueId) || { notes: '' };
    newAnnotations.set(issueId, { ...existing, notes });
    setAnnotations(newAnnotations);
    setEditingIssue(null);
    
    if (onSaveAnnotations) {
      onSaveAnnotations(Object.fromEntries(newAnnotations));
    }
  };

  return (
    <div className="bg-[#151515] rounded-lg border border-[#2a2a2a] overflow-hidden hover:border-[#3a3a3a] transition-colors">
      {/* User Header - Clickable to expand/collapse */}
      <div 
        className="px-4 py-3 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center gap-3 cursor-pointer hover:bg-[#1e1e1e] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Avatar className="h-9 w-9">
          <AvatarImage src={member.userImage} />
          <AvatarFallback className="bg-[#2a2a2a] text-white text-sm">
            {member.userName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{member.userName}</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{member.yesterday.length} yesterday</span>
            <span>•</span>
            <span>{member.today.length} today</span>
            {member.insights.warnings.length > 0 && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1 text-yellow-400">
                  <AlertCircle className="h-3 w-3" />
                  <span>{member.insights.warnings.length}</span>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Expand/Collapse Icon */}
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
        )}
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <>
          {/* Warnings */}
          {member.insights.warnings.length > 0 && (
            <div className="px-4 py-2 bg-yellow-500/5 border-b border-yellow-500/20">
              {member.insights.warnings.map((warning, idx) => (
                <div key={idx} className="text-xs text-yellow-400 flex items-start gap-2">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Split Content: Yesterday | Today */}
          <div className="grid grid-cols-2 divide-x divide-[#2a2a2a]">
        {/* Yesterday Side */}
        <div className="p-3">
          {/* Status Summary Badges */}
          {member.yesterday.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {member.yesterday.filter(i => i.statusSymbol === '✅').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-green-500/50 text-green-400 bg-green-500/10">
                  ✅ {member.yesterday.filter(i => i.statusSymbol === '✅').length}
                </Badge>
              )}
              {member.yesterday.filter(i => i.statusSymbol === '⛔️').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-red-500/50 text-red-400 bg-red-500/10">
                  ⛔️ {member.yesterday.filter(i => i.statusSymbol === '⛔️').length}
                </Badge>
              )}
              {member.yesterday.filter(i => i.statusSymbol === '🔍').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-amber-500/50 text-amber-400 bg-amber-500/10">
                  🔍 {member.yesterday.filter(i => i.statusSymbol === '🔍').length}
                </Badge>
              )}
              {member.yesterday.filter(i => i.statusSymbol === '⚡️').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-purple-500/50 text-purple-400 bg-purple-500/10">
                  ⚡️ {member.yesterday.filter(i => i.statusSymbol === '⚡️').length}
                </Badge>
              )}
            </div>
          )}

          {/* Issues List */}
          <div className="space-y-1">
            {member.yesterday.length > 0 ? (
              member.yesterday.map((issue) => (
                <IssueRow
                  key={issue.issueId}
                  issue={issue}
                  workspaceSlug={workspaceSlug}
                  editable={false}
                  isEditing={editingIssue === issue.issueId}
                  annotation={annotations.get(issue.issueId)}
                  onEdit={() => setEditingIssue(issue.issueId)}
                  onSave={(notes) => handleSaveNote(issue.issueId, notes)}
                  onCancel={() => setEditingIssue(null)}
                />
              ))
            ) : (
              <div className="text-xs text-gray-600 italic py-4 text-center">No activity</div>
            )}
          </div>
        </div>

        {/* Today Side */}
        <div className="p-3">
          {/* Status Summary Badges */}
          {member.today.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {member.today.filter(i => i.statusSymbol === '💼').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-blue-500/50 text-blue-400 bg-blue-500/10">
                  💼 {member.today.filter(i => i.statusSymbol === '💼').length}
                </Badge>
              )}
              {member.today.filter(i => i.statusSymbol === '🔍').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-amber-500/50 text-amber-400 bg-amber-500/10">
                  🔍 {member.today.filter(i => i.statusSymbol === '🔍').length}
                </Badge>
              )}
              {member.today.filter(i => i.statusSymbol === '🎯').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                  🎯 {member.today.filter(i => i.statusSymbol === '🎯').length}
                </Badge>
              )}
              {member.today.filter(i => i.statusSymbol === '🚫').length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 border-orange-500/50 text-orange-400 bg-orange-500/10">
                  🚫 {member.today.filter(i => i.statusSymbol === '🚫').length}
                </Badge>
              )}
            </div>
          )}

          {/* Issues List */}
          <div className="space-y-1">
            {member.today.length > 0 ? (
              member.today.map((issue) => (
                <IssueRow
                  key={issue.issueId}
                  issue={issue}
                  workspaceSlug={workspaceSlug}
                  editable={editable}
                  isEditing={editingIssue === issue.issueId}
                  annotation={annotations.get(issue.issueId)}
                  onEdit={() => setEditingIssue(issue.issueId)}
                  onSave={(notes) => handleSaveNote(issue.issueId, notes)}
                  onCancel={() => setEditingIssue(null)}
                />
              ))
            ) : (
              <div className="text-xs text-gray-600 italic py-4 text-center">No planned work</div>
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

interface IssueRowProps {
  issue: IssueActivity;
  workspaceSlug: string;
  editable: boolean;
  isEditing: boolean;
  annotation?: { notes: string; symbol?: string };
  onEdit: () => void;
  onSave: (notes: string) => void;
  onCancel: () => void;
}

function IssueRow({
  issue,
  workspaceSlug,
  editable,
  isEditing,
  annotation,
  onEdit,
  onSave,
  onCancel,
}: IssueRowProps) {
  const [noteText, setNoteText] = useState(annotation?.notes || '');

  const displaySymbol = annotation?.symbol || issue.statusSymbol;

  return (
    <div
      className={cn(
        "group flex items-start gap-2 p-2 rounded hover:bg-[#1a1a1a] transition-colors",
        isEditing && "bg-[#1a1a1a]"
      )}
    >
      {/* Status Symbol */}
      {displaySymbol && (
        <span className="text-sm flex-shrink-0 mt-0.5">{displaySymbol}</span>
      )}

      <div className="flex-1 min-w-0">
        {/* Issue Title */}
        <div className="flex items-start gap-1.5 flex-wrap">
          <Link
            href={`/${workspaceSlug}/issues/${issue.issueKey}`}
            className="text-xs text-white hover:text-blue-400 font-medium"
          >
            {issue.issueKey}
          </Link>
          <span className="text-xs text-gray-400 line-clamp-2 flex-1">{issue.title}</span>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs text-gray-600">{issue.projectName}</span>
          
          {issue.daysInProgress && issue.daysInProgress > 0 && (
            <Badge variant="outline" className="text-xs h-4 px-1 border-orange-500/50 text-orange-400">
              {issue.daysInProgress}d
            </Badge>
          )}
          
          {issue.priority && ['URGENT', 'HIGH'].includes(issue.priority) && (
            <Badge variant="outline" className="text-xs h-4 px-1 border-red-500/50 text-red-400">
              {issue.priority}
            </Badge>
          )}
        </div>

        {/* Notes */}
        {!isEditing && (annotation?.notes || issue.notes) && (
          <div className="text-xs text-gray-400 mt-1 italic">
            {annotation?.notes || issue.notes}
          </div>
        )}

        {/* Edit Mode */}
        {isEditing && (
          <div className="mt-2 space-y-2">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add notes..."
              className="min-h-[60px] text-xs bg-[#0f0f0f] border-[#3a3a3a]"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onSave(noteText)}
                className="h-6 text-xs px-2"
              >
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                className="h-6 text-xs px-2"
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Button */}
      {editable && !isEditing && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

