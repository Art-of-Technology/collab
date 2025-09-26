import { z } from 'zod';
import { AppScope, AppManifestV1 } from './types';

// Valid app scopes - must match the type definition
const validScopes: AppScope[] = [
  'workspace:read',
  'issues:read', 
  'user:read',
  'issues:write',
  'comments:read',
  'comments:write',
  'leave:read',
  'leave:write'
];

// Zod schema for app scopes
export const AppScopeSchema = z.enum([
  'workspace:read',
  'issues:read', 
  'user:read',
  'issues:write',
  'comments:read',
  'comments:write',
  'leave:read',
  'leave:write'
] as const);

// Publisher information schema
export const AppPublisherSchema = z.object({
  name: z.string().min(1, 'Publisher name is required'),
  url: z.string().url('Invalid publisher URL'),
  support_email: z.string().email('Invalid support email'),
  privacy_url: z.string().url('Invalid privacy URL').optional(),
  terms_url: z.string().url('Invalid terms URL').optional()
});

// OAuth configuration schema
export const AppOAuthSchema = z.object({
  client_id: z.string().min(1, 'OAuth client_id is required'),
  redirect_uris: z.array(z.string().url('Invalid redirect URI')).min(1, 'At least one redirect URI is required'),
  scopes: z.array(AppScopeSchema).optional(),
  client_secret: z.string().optional()
});

// Webhooks configuration schema
export const AppWebhooksSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  events: z.array(z.string()).min(1, 'At least one webhook event is required')
});

// API versions schema
export const AppVersionsSchema = z.object({
  min_api: z.string().min(1, 'Minimum API version is required'),
  tested_api: z.string().min(1, 'Tested API version is required')
});

// CSP configuration schema
export const AppCSPSchema = z.object({
  connectSrc: z.array(z.string()).optional(),
  imgSrc: z.array(z.string()).optional(),
  frameAncestors: z.array(z.string()).optional()
});

// Main app manifest schema
export const AppManifestV1Schema = z.object({
  schema: z.string().url('Invalid schema URL'),
  
  name: z.string()
    .min(1, 'App name is required')
    .max(100, 'App name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'App name contains invalid characters'),
  
  slug: z.string()
    .min(1, 'App slug is required')
    .max(50, 'App slug must be less than 50 characters')
    .regex(/^[a-z0-9\-]+$/, 'App slug must be lowercase alphanumeric with hyphens only')
    .refine(slug => !slug.startsWith('-') && !slug.endsWith('-'), 'App slug cannot start or end with hyphen'),
  
  version: z.string().min(1, 'App version is required'),
  
  description: z.string().min(1, 'App description is required').max(500, 'Description must be less than 500 characters'),
  
  // App configuration
  type: z.enum(['external_iframe', 'mfe_remote', 'server_only'], {
    errorMap: () => ({ message: 'App type must be external_iframe, mfe_remote, or server_only' })
  }),
  
  entrypoint_url: z.string().url('Invalid entrypoint URL'),
  
  icon_url: z.string().url('Invalid icon URL').optional(),
  
  // Publisher information
  publisher: AppPublisherSchema,
  
  // OAuth configuration
  oauth: AppOAuthSchema.optional(),
  
  // Webhooks configuration
  webhooks: AppWebhooksSchema.optional(),
  
  // Permissions and scopes
  scopes: z.array(AppScopeSchema)
    .min(1, 'At least one scope is required')
    .max(10, 'Maximum 10 scopes allowed')
    .refine(scopes => new Set(scopes).size === scopes.length, 'Duplicate scopes are not allowed'),
  
  permissions: z.object({
    org: z.boolean(),
    user: z.boolean()
  }),
  
  // App metadata
  category: z.string().optional(),
  visibility: z.enum(['public', 'limited', 'private'], {
    errorMap: () => ({ message: 'Visibility must be public, limited, or private' })
  }),
  
  // API compatibility
  versions: AppVersionsSchema,
  
  // Security configuration
  csp: AppCSPSchema.optional(),
  
  // Legacy fields for backward compatibility
  homepage_url: z.string().url('Invalid homepage URL').optional(),
  permissions_legacy: z.array(AppScopeSchema).optional()
});

// Import manifest request schema
export const ImportManifestRequestSchema = z.object({
  url: z.string().url('Invalid manifest URL'),
  publisherId: z.string().min(1, 'Publisher ID is required').optional()
});

// App creation schema (for direct creation without manifest URL)
export const CreateAppRequestSchema = z.object({
  manifest: AppManifestV1Schema,
  publisherId: z.string().min(1, 'Publisher ID is required').optional()
});

// Validation helper functions
export function validateAppManifest(manifest: unknown): AppManifestV1 {
  try {
    return AppManifestV1Schema.parse(manifest);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }));
      throw new Error(`Manifest validation failed: ${issues.map(i => `${i.field}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

export function validateAppScope(scope: string): scope is AppScope {
  return validScopes.includes(scope as AppScope);
}

export function validateAppSlug(slug: string): boolean {
  return /^[a-z0-9\-]+$/.test(slug) && 
         !slug.startsWith('-') && 
         !slug.endsWith('-') && 
         slug.length >= 1 && 
         slug.length <= 50;
}

// Reserved app slugs that cannot be used
export const RESERVED_APP_SLUGS = [
  'admin',
  'api', 
  'app',
  'apps',
  'auth',
  'callback',
  'collab',
  'dashboard',
  'dev',
  'developer',
  'docs',
  'home',
  'install',
  'manifest',
  'oauth',
  'settings',
  'system',
  'uninstall',
  'webhook',
  'webhooks'
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_APP_SLUGS.includes(slug.toLowerCase());
}

// Validation for manifest URLs
export function validateManifestUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Must be HTTPS in production
    if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
      return false;
    }
    // Must end with .json or have json content-type (we'll check content-type in the API)
    return parsedUrl.pathname.endsWith('.json') || parsedUrl.pathname.endsWith('/manifest');
  } catch {
    return false;
  }
}
