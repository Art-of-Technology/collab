import { PrismaClient } from '@prisma/client';
import { AppManifestV1 } from './apps/types';

const prisma = new PrismaClient();

/**
 * Security utilities for the Collab App Platform
 */

/**
 * Extract origin from URL safely
 */
export function getOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Validate if an origin is allowed for postMessage communication
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes(origin);
}

/**
 * Get all allowed origins from installed apps in a workspace
 */
export async function getAllowedOriginsForWorkspace(workspaceId: string): Promise<string[]> {
  try {
    const installations = await prisma.appInstallation.findMany({
      where: {
        workspaceId,
        status: 'ACTIVE'
      },
      include: {
        app: {
          include: {
            versions: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    const origins = new Set<string>();

    for (const installation of installations) {
      const latestVersion = installation.app.versions[0];
      if (latestVersion) {
        const manifest = latestVersion.manifest as unknown as AppManifestV1;
        if (manifest.entrypoint_url) {
          const origin = getOrigin(manifest.entrypoint_url);
          if (origin) {
            origins.add(origin);
          }
        }
      }
    }

    return Array.from(origins);
  } catch (error) {
    console.error('Error fetching allowed origins:', error);
    return [];
  }
}

/**
 * Get all allowed origins from all published apps (for global discovery)
 */
export async function getAllowedOriginsForAllApps(): Promise<string[]> {
  try {
    const apps = await prisma.app.findMany({
      where: {
        status: 'PUBLISHED'
      },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const origins = new Set<string>();

    for (const app of apps) {
      const latestVersion = app.versions[0];
      if (latestVersion) {
        const manifest = latestVersion.manifest as unknown as AppManifestV1;
        if (manifest.entrypoint_url) {
          const origin = getOrigin(manifest.entrypoint_url);
          if (origin) {
            origins.add(origin);
          }
        }
      }
    }

    return Array.from(origins);
  } catch (error) {
    console.error('Error fetching all app origins:', error);
    return [];
  }
}

/**
 * Build Content Security Policy string
 */
export interface CSPOptions {
  allowedFrameOrigins?: string[];
  allowedConnectOrigins?: string[];
  allowInlineScripts?: boolean;
  allowInlineStyles?: boolean;
  reportUri?: string;
}

export function buildCSP(options: CSPOptions = {}): string {
  const {
    allowedFrameOrigins = [],
    allowedConnectOrigins = [],
    allowInlineScripts = false,
    allowInlineStyles = true,
    reportUri
  } = options;

  const directives: string[] = [];

  // Default source
  directives.push("default-src 'self'");

  // Script source
  const scriptSrc = ["'self'"];
  if (allowInlineScripts) {
    scriptSrc.push("'unsafe-inline'");
  }
  directives.push(`script-src ${scriptSrc.join(' ')}`);

  // Style source
  const styleSrc = ["'self'"];
  if (allowInlineStyles) {
    styleSrc.push("'unsafe-inline'");
  }
  directives.push(`style-src ${styleSrc.join(' ')}`);

  // Frame source (for app iframes)
  const frameSrc = ["'self'"];
  if (allowedFrameOrigins.length > 0) {
    frameSrc.push(...allowedFrameOrigins);
  }
  directives.push(`frame-src ${frameSrc.join(' ')}`);

  // Connect source (for API calls)
  const connectSrc = ["'self'"];
  if (allowedConnectOrigins.length > 0) {
    connectSrc.push(...allowedConnectOrigins);
  }
  directives.push(`connect-src ${connectSrc.join(' ')}`);

  // Image source
  directives.push("img-src 'self' data: https:");

  // Font source
  directives.push("font-src 'self' https:");

  // Object and embed
  directives.push("object-src 'none'");
  directives.push("embed-src 'none'");

  // Base URI
  directives.push("base-uri 'self'");

  // Form action
  directives.push("form-action 'self'");

  // Frame ancestors (prevent clickjacking)
  directives.push("frame-ancestors 'none'");

  // Report URI
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join('; ');
}

/**
 * Get comprehensive security headers
 */
export function getSecurityHeaders(csp?: string): Record<string, string> {
  const headers: Record<string, string> = {
    // Content Security Policy
    ...(csp && { 'Content-Security-Policy': csp }),
    
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Enable XSS protection
    'X-XSS-Protection': '1; mode=block',
    
    // Strict Transport Security (HTTPS only)
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    
    // Referrer Policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions Policy (formerly Feature Policy)
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'accelerometer=()',
      'gyroscope=()'
    ].join(', ')
  };

  return headers;
}

/**
 * Validate app manifest security requirements
 */
export function validateAppManifestSecurity(manifest: AppManifestV1): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate homepage URL
  if (!manifest.entrypoint_url) {
    errors.push('App manifest must include entrypoint_url');
  } else {
    const origin = getOrigin(manifest.entrypoint_url);
    if (!origin) {
      errors.push('Invalid entrypoint_url in app manifest');
    } else if (!origin.startsWith('https://') && !origin.startsWith('http://localhost')) {
      errors.push('App entrypoint_url must use HTTPS (except localhost for development)');
    }
  }

  // Validate scopes are not excessive
  const scopes = manifest.scopes || [];
  const suspiciousScopes = scopes.filter(s => 
    s.includes('admin') || s.includes('delete') || s.includes('destroy')
  );
  
  if (suspiciousScopes.length > 0) {
    errors.push(`Potentially dangerous scopes: ${suspiciousScopes.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
