/**
 * Secrets Access Control Helpers
 *
 * Handles access control logic for secrets and restricted notes,
 * working with existing NoteScope + NoteShare system.
 */

import { prisma } from '@/lib/prisma';
import { NoteScope, NoteSharePermission } from '@prisma/client';

interface NoteWithAccess {
  id: string;
  authorId: string;
  scope: NoteScope;
  isRestricted: boolean;
  isEncrypted: boolean;
  expiresAt: Date | null;
  workspaceId: string | null;
  projectId: string | null;
  sharedWith?: {
    userId: string;
    permission: NoteSharePermission;
  }[];
}

export interface AccessCheckResult {
  canAccess: boolean;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  isOwner: boolean;
  isExpired: boolean;
  reason?: string;
}

/**
 * Check if a user can access a secret/restricted note
 * Respects the isRestricted flag which limits access even for PROJECT/WORKSPACE scope
 *
 * @param userId - ID of the user trying to access
 * @param note - Note with access-related fields
 * @param workspaceMembership - User's workspace membership (for admin check)
 * @returns Access check result with permissions
 */
export async function checkNoteAccess(
  userId: string,
  note: NoteWithAccess,
  workspaceMembership?: { role: string } | null
): Promise<AccessCheckResult> {
  const isOwner = note.authorId === userId;
  const isExpired = note.expiresAt ? new Date() > note.expiresAt : false;

  // Check if expired
  if (isExpired && !isOwner) {
    return {
      canAccess: false,
      canEdit: false,
      canShare: false,
      canDelete: false,
      isOwner,
      isExpired: true,
      reason: 'This secret has expired'
    };
  }

  // Owner always has full access
  if (isOwner) {
    return {
      canAccess: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
      isOwner: true,
      isExpired
    };
  }

  // Workspace admin has full access
  const isAdmin = workspaceMembership?.role === 'ADMIN' || workspaceMembership?.role === 'OWNER';
  if (isAdmin) {
    return {
      canAccess: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
      isOwner: false,
      isExpired
    };
  }

  // Check share list for edit permission
  const shareRecord = note.sharedWith?.find(s => s.userId === userId);
  const hasEditPermission = shareRecord?.permission === NoteSharePermission.EDIT;

  // For restricted notes, MUST be in share list
  if (note.isRestricted) {
    if (!shareRecord) {
      return {
        canAccess: false,
        canEdit: false,
        canShare: false,
        canDelete: false,
        isOwner: false,
        isExpired,
        reason: 'Access to this restricted note requires explicit permission'
      };
    }

    return {
      canAccess: true,
      canEdit: hasEditPermission,
      canShare: false,
      canDelete: false,
      isOwner: false,
      isExpired
    };
  }

  // For non-restricted notes, use standard scope-based access
  switch (note.scope) {
    case NoteScope.PERSONAL:
      // Personal notes: only accessible if shared
      if (!shareRecord) {
        return {
          canAccess: false,
          canEdit: false,
          canShare: false,
          canDelete: false,
          isOwner: false,
          isExpired,
          reason: 'This is a personal note'
        };
      }
      return {
        canAccess: true,
        canEdit: hasEditPermission,
        canShare: false,
        canDelete: false,
        isOwner: false,
        isExpired
      };

    case NoteScope.PROJECT:
    case NoteScope.WORKSPACE:
      // Project/Workspace notes: accessible to all members
      return {
        canAccess: true,
        canEdit: hasEditPermission,
        canShare: false,
        canDelete: false,
        isOwner: false,
        isExpired
      };

    case NoteScope.PUBLIC:
      // Public notes: accessible to everyone
      return {
        canAccess: true,
        canEdit: hasEditPermission,
        canShare: false,
        canDelete: false,
        isOwner: false,
        isExpired
      };

    case NoteScope.SHARED:
      // Deprecated scope - treat as personal + shares
      if (!shareRecord) {
        return {
          canAccess: false,
          canEdit: false,
          canShare: false,
          canDelete: false,
          isOwner: false,
          isExpired,
          reason: 'This note has not been shared with you'
        };
      }
      return {
        canAccess: true,
        canEdit: hasEditPermission,
        canShare: false,
        canDelete: false,
        isOwner: false,
        isExpired
      };

    default:
      return {
        canAccess: false,
        canEdit: false,
        canShare: false,
        canDelete: false,
        isOwner: false,
        isExpired,
        reason: 'Unknown note scope'
      };
  }
}

/**
 * Quick check if a user can access a note by ID
 * @param userId - ID of the user trying to access
 * @param noteId - ID of the note to check
 * @returns Access check result
 */
export async function canAccessNote(
  userId: string,
  noteId: string
): Promise<AccessCheckResult> {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      sharedWith: {
        select: {
          userId: true,
          permission: true
        }
      }
    }
  });

  if (!note) {
    return {
      canAccess: false,
      canEdit: false,
      canShare: false,
      canDelete: false,
      isOwner: false,
      isExpired: false,
      reason: 'Note not found'
    };
  }

  // Get user's workspace membership for admin check
  let workspaceMembership = null;
  if (note.workspaceId) {
    workspaceMembership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: note.workspaceId
        }
      },
      select: { role: true }
    });
  }

  return checkNoteAccess(userId, note, workspaceMembership);
}

/**
 * Log a note access attempt
 * @param noteId - ID of the note
 * @param userId - ID of the user
 * @param action - Action being performed
 * @param details - Additional details
 * @param request - Request object for IP/user agent
 */
export async function logNoteAccess(
  noteId: string,
  userId: string,
  action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'REVEAL' | 'COPY' | 'COPY_ALL' | 'EXPORT' | 'SHARE' | 'UNSHARE' | 'PIN' | 'UNPIN' | 'ACCESS_DENIED',
  details?: Record<string, unknown>,
  request?: Request
) {
  let ipAddress: string | undefined;
  let userAgent: string | undefined;

  if (request) {
    // Try to get IP from various headers
    ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                request.headers.get('x-real-ip') ||
                undefined;
    userAgent = request.headers.get('user-agent') || undefined;
  }

  await prisma.noteActivityLog.create({
    data: {
      noteId,
      userId,
      action,
      details: details ? JSON.stringify(details) : null,
      ipAddress,
      userAgent
    }
  });
}

/**
 * Get the access list for a note (for UI display)
 * @param noteId - ID of the note
 * @returns List of users with access
 */
export async function getNoteAccessList(noteId: string) {
  const shares = await prisma.noteShare.findMany({
    where: { noteId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      },
      sharer: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { sharedAt: 'desc' }
  });

  return shares.map(s => ({
    userId: s.userId,
    userName: s.user.name,
    userEmail: s.user.email,
    userImage: s.user.image,
    permission: s.permission,
    sharedAt: s.sharedAt,
    sharedBy: s.sharer.name
  }));
}

/**
 * Get audit log for a note
 * @param noteId - ID of the note
 * @param options - Pagination and filtering options
 * @returns Activity logs with user info
 */
export async function getNoteAuditLog(
  noteId: string,
  options: {
    limit?: number;
    offset?: number;
    action?: string;
  } = {}
) {
  const { limit = 50, offset = 0, action } = options;

  const [logs, total] = await Promise.all([
    prisma.noteActivityLog.findMany({
      where: {
        noteId,
        ...(action && { action: action as any })
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.noteActivityLog.count({
      where: {
        noteId,
        ...(action && { action: action as any })
      }
    })
  ]);

  return {
    logs: logs.map(log => ({
      id: log.id,
      action: log.action,
      details: log.details ? JSON.parse(log.details) : null,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.user
    })),
    total,
    hasMore: offset + logs.length < total
  };
}
