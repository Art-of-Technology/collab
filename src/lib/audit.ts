import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Security audit logging for the Collab App Platform
 */

export interface AuditLogEntry {
  workspaceId: string;
  userId?: string;
  appId?: string;
  installationId?: string;
  action: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * Log security events to the audit trail
 */
export async function logSecurityEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.appAuditLog.create({
      data: {
        workspaceId: entry.workspaceId,
        installationId: entry.installationId,
        actorId: entry.userId,
        action: entry.action,
        details: {
          ...entry.details,
          success: entry.success,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          ...(entry.errorMessage && { error: entry.errorMessage }),
          timestamp: new Date().toISOString()
        }
      }
    });

    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔒 Audit: ${entry.action}`, {
        workspace: entry.workspaceId,
        user: entry.userId,
        app: entry.appId,
        success: entry.success,
        details: entry.details
      });
    }
  } catch (error) {
    console.error('Failed to log security event:', error);
    // Don't throw - audit logging failures shouldn't break the app
  }
}

/**
 * Common security events
 */
export const SECURITY_EVENTS = {
  APP_INSTALL_ATTEMPT: 'app.install.attempt',
  APP_INSTALL_SUCCESS: 'app.install.success',
  APP_INSTALL_FAILED: 'app.install.failed',
  APP_UNINSTALL: 'app.uninstall',
  APP_ACCESS: 'app.access',
  APP_ACCESS_DENIED: 'app.access.denied',
  BRIDGE_MESSAGE_BLOCKED: 'bridge.message.blocked',
  BRIDGE_RATE_LIMIT: 'bridge.rate_limit',
  OAUTH_START: 'oauth.start',
  OAUTH_SUCCESS: 'oauth.success',
  OAUTH_FAILED: 'oauth.failed',
  PERMISSION_DENIED: 'permission.denied',
  SUSPICIOUS_ACTIVITY: 'suspicious.activity'
} as const;

/**
 * Helper functions for common audit events
 */

export async function logAppInstallAttempt(
  workspaceId: string, 
  userId: string, 
  appId: string, 
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({
    workspaceId,
    userId,
    appId,
    action: SECURITY_EVENTS.APP_INSTALL_ATTEMPT,
    details,
    success: true
  });
}

export async function logAppInstallSuccess(
  workspaceId: string, 
  userId: string, 
  appId: string, 
  installationId: string,
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({
    workspaceId,
    userId,
    appId,
    installationId,
    action: SECURITY_EVENTS.APP_INSTALL_SUCCESS,
    details,
    success: true
  });
}

export async function logAppInstallFailed(
  workspaceId: string, 
  userId: string, 
  appId: string, 
  error: string,
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({
    workspaceId,
    userId,
    appId,
    action: SECURITY_EVENTS.APP_INSTALL_FAILED,
    details,
    success: false,
    errorMessage: error
  });
}

export async function logAppAccess(
  workspaceId: string, 
  userId: string, 
  appId: string, 
  installationId: string,
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({
    workspaceId,
    userId,
    appId,
    installationId,
    action: SECURITY_EVENTS.APP_ACCESS,
    details,
    success: true
  });
}

export async function logAppAccessDenied(
  workspaceId: string, 
  reason: string,
  userId?: string, 
  appId?: string, 
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({
    workspaceId,
    userId,
    appId,
    action: SECURITY_EVENTS.APP_ACCESS_DENIED,
    details: { ...details, reason },
    success: false,
    errorMessage: reason
  });
}

export async function logBridgeMessageBlocked(
  workspaceId: string, 
  userId: string, 
  appId: string, 
  installationId: string,
  reason: string,
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({
    workspaceId,
    userId,
    appId,
    installationId,
    action: SECURITY_EVENTS.BRIDGE_MESSAGE_BLOCKED,
    details: { ...details, reason },
    success: false,
    errorMessage: reason
  });
}

export async function logSuspiciousActivity(
  workspaceId: string, 
  activity: string,
  userId?: string, 
  appId?: string, 
  details?: Record<string, any>
): Promise<void> {
  await logSecurityEvent({
    workspaceId,
    userId,
    appId,
    action: SECURITY_EVENTS.SUSPICIOUS_ACTIVITY,
    details: { ...details, activity },
    success: false,
    errorMessage: activity
  });
}
