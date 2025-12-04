"use client";

import { useState, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Download, Edit2, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { TeamMemberSync, IssueActivity } from '@/utils/teamSyncAnalyzer';

interface TeamSyncViewProps {
  teamSync: TeamMemberSync[];
  workspaceSlug: string;
  date: Date;
  onSaveAnnotations?: (annotations: any) => void;
  editable?: boolean;
}

export function TeamSyncView({
  teamSync,
  workspaceSlug,
  date,
  onSaveAnnotations,
  editable = true,
}: TeamSyncViewProps) {
  const [editingIssue, setEditingIssue] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Map<string, { notes: string; symbol?: string }>>(
    new Map()
  );
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(
    new Set(teamSync.map(m => m.userId)) // All expanded by default
  );

  const toggleMember = (userId: string) => {
    const newExpanded = new Set(expandedMembers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedMembers(newExpanded);
  };

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleExportMarkdown = () => {
    let markdown = `# Team Sync - ${formattedDate}\n\n`;

    for (const member of teamSync) {
      markdown += `## ${member.userName}\n\n`;

      if (member.yesterday.length > 0) {
        markdown += `### Yesterday\n\n`;
        for (const issue of member.yesterday) {
          const annotation = annotations.get(issue.issueId);
          const symbol = annotation?.symbol || issue.statusSymbol;
          markdown += `${symbol} ${issue.issueKey} - ${issue.title}`;
          if (annotation?.notes) {
            markdown += ` (${annotation.notes})`;
          }
          markdown += '\n';
        }
        markdown += '\n';
      }

      if (member.today.length > 0) {
        markdown += `### Today\n\n`;
        for (const issue of member.today) {
          const annotation = annotations.get(issue.issueId);
          markdown += `${annotation?.symbol || ''} ${issue.issueKey} - ${issue.title}`;
          if (annotation?.notes) {
            markdown += ` (${annotation.notes})`;
          }
          if (issue.daysInProgress && issue.daysInProgress > 0) {
            markdown += ` [${issue.daysInProgress}d]`;
          }
          markdown += '\n';
        }
        markdown += '\n';
      }

      if (member.blockers.length > 0) {
        markdown += `### Blockers\n\n`;
        for (const issue of member.blockers) {
          markdown += `🔀 ${issue.issueKey} - ${issue.title}`;
          if (issue.notes) {
            markdown += ` (${issue.notes})`;
          }
          markdown += '\n';
        }
        markdown += '\n';
      }

      if (member.insights.warnings.length > 0) {
        markdown += `### Insights\n\n`;
        for (const warning of member.insights.warnings) {
          markdown += `⚠️ ${warning}\n`;
        }
        markdown += '\n';
      }

      markdown += '---\n\n';
    }

    // Download as file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-sync-${date.toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{formattedDate}</h2>
          <p className="text-sm text-gray-400">
            {teamSync.length} {teamSync.length === 1 ? 'team member' : 'team members'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportMarkdown}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export Markdown
        </Button>
      </div>

      {/* Team Members */}
      <div className="space-y-4">
        {teamSync.map((member) => {
          const isExpanded = expandedMembers.has(member.userId);
          
          return (
            <Card key={member.userId} className="bg-[#1a1a1a] border-[#2a2a2a] overflow-hidden">
              {/* Member Header - Always Visible */}
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#1e1e1e] transition-colors"
                onClick={() => toggleMember(member.userId)}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.userImage} />
                    <AvatarFallback className="bg-[#2a2a2a] text-white">
                      {member.userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{member.userName}</h3>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{member.today.length} in progress</span>
                      {member.insights.tasksCompletedToday > 0 && (
                        <span>✅ {member.insights.tasksCompletedToday} completed</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Insights Badge */}
                  {member.insights.warnings.length > 0 && (
                    <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {member.insights.warnings.length}
                    </Badge>
                  )}
                  
                  {/* Expand/Collapse Icon */}
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Collapsible Content */}
              {isExpanded && (
                <div className="px-4 pb-4">
                  {/* Warnings */}
                  {member.insights.warnings.length > 0 && (
                    <div className="mb-4 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                      {member.insights.warnings.map((warning, idx) => (
                        <div key={idx} className="text-sm text-yellow-400 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Side-by-Side: Yesterday and Today */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    {/* Yesterday Column */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Yesterday</h4>
                      {member.yesterday.length > 0 ? (
                        <>
                          {/* Status Summary Badges */}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {member.yesterday.filter(i => i.statusSymbol === '✅').length > 0 && (
                              <Badge variant="outline" className="text-xs border-green-500/50 text-green-400 bg-green-500/10">
                                ✅ {member.yesterday.filter(i => i.statusSymbol === '✅').length}
                              </Badge>
                            )}
                            {member.yesterday.filter(i => i.statusSymbol === '⛔️').length > 0 && (
                              <Badge variant="outline" className="text-xs border-red-500/50 text-red-400 bg-red-500/10">
                                ⛔️ {member.yesterday.filter(i => i.statusSymbol === '⛔️').length}
                              </Badge>
                            )}
                            {member.yesterday.filter(i => i.statusSymbol === '🔍').length > 0 && (
                              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400 bg-amber-500/10">
                                🔍 {member.yesterday.filter(i => i.statusSymbol === '🔍').length}
                              </Badge>
                            )}
                            {member.yesterday.filter(i => i.statusSymbol === '⚡️').length > 0 && (
                              <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-400 bg-purple-500/10">
                                ⚡️ {member.yesterday.filter(i => i.statusSymbol === '⚡️').length}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            {member.yesterday.map((issue) => (
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
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-500 italic py-2">No activity</div>
                      )}
                    </div>

                    {/* Today Column */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Today</h4>
                      {member.today.length > 0 ? (
                        <>
                          {/* Status Summary Badges */}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {member.today.filter(i => i.statusSymbol === '💼').length > 0 && (
                              <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-400 bg-blue-500/10">
                                💼 {member.today.filter(i => i.statusSymbol === '💼').length}
                              </Badge>
                            )}
                            {member.today.filter(i => i.statusSymbol === '🔍').length > 0 && (
                              <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400 bg-amber-500/10">
                                🔍 {member.today.filter(i => i.statusSymbol === '🔍').length}
                              </Badge>
                            )}
                            {member.today.filter(i => i.statusSymbol === '🎯').length > 0 && (
                              <Badge variant="outline" className="text-xs border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                                🎯 {member.today.filter(i => i.statusSymbol === '🎯').length}
                              </Badge>
                            )}
                            {member.today.filter(i => i.statusSymbol === '🚫').length > 0 && (
                              <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-400 bg-orange-500/10">
                                🚫 {member.today.filter(i => i.statusSymbol === '🚫').length}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            {member.today.map((issue) => (
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
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-500 italic py-2">No planned work</div>
                      )}
                    </div>
                  </div>

                  {/* Blockers Section - Full Width */}
                  {member.blockers.length > 0 && (
                    <div className="pt-4 border-t border-[#2a2a2a]">
                      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Blockers</h4>
                      <div className="space-y-1">
                        {member.blockers.map((issue) => (
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
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {teamSync.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No activity found for the selected filters
        </div>
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
        "group flex items-start gap-2 p-2 rounded hover:bg-[#2a2a2a] transition-colors",
        isEditing && "bg-[#2a2a2a]"
      )}
    >
      {/* Status Symbol */}
      {displaySymbol && (
        <span className="text-lg flex-shrink-0 mt-0.5">{displaySymbol}</span>
      )}

      <div className="flex-1 min-w-0">
        {/* Issue Title */}
        <div className="flex items-center gap-2">
          <Link
            href={`/${workspaceSlug}/issues/${issue.issueKey}`}
            className="text-sm text-white hover:text-blue-400 font-medium truncate"
          >
            {issue.issueKey} - {issue.title}
          </Link>
          
          {issue.daysInProgress && issue.daysInProgress > 0 && (
            <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-400">
              {issue.daysInProgress}d
            </Badge>
          )}
          
          {issue.priority && ['URGENT', 'HIGH'].includes(issue.priority) && (
            <Badge variant="outline" className="text-xs border-red-500/50 text-red-400">
              {issue.priority}
            </Badge>
          )}
        </div>

        {/* Project Name */}
        <div className="text-xs text-gray-500 mt-0.5">{issue.projectName}</div>

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
              className="min-h-[60px] text-sm bg-[#0f0f0f] border-[#3a3a3a]"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onSave(noteText)}
                className="h-7 text-xs"
              >
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                className="h-7 text-xs"
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

