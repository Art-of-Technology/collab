import { lookup } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { z } from 'zod';
import { AppScope, AppManifestV1 } from './types';

// Valid app scopes - must match the type definition
const validScopes: AppScope[] = [
  'workspace:read',
  'issues:read',
  'issues:write', 
  'user:read',
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
  client_id: z.string().min(1, 'OAuth client_id is required').optional(), // Optional during submission, generated on approval
  client_type: z.enum(['confidential', 'public']),
  token_endpoint_auth_method: z.enum(['client_secret_basic', 'none', 'private_key_jwt']),
  redirect_uris: z.array(z.string().url('Invalid redirect URI')).min(1, 'At least one redirect URI is required'),
  scopes: z.array(AppScopeSchema).optional(),
  post_logout_redirect_uris: z.array(z.string().url('Invalid post logout redirect URI')).optional(),
  response_types: z.array(z.literal("code")).default(["code"]),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .default(["authorization_code", "refresh_token"]),
  jwks_uri: z.string().url('Invalid JWKS URI').optional()
}).refine((data) => {
  // For public clients, auth method must be 'none'
  if (data.client_type === 'public' && data.token_endpoint_auth_method !== 'none') {
    return false;
  }
  // For confidential clients with private_key_jwt, jwks_uri is required
  if (data.client_type === 'confidential' && data.token_endpoint_auth_method === 'private_key_jwt' && !data.jwks_uri) {
    return false;
  }
  // For confidential clients with client_secret_basic, jwks_uri should not be present
  if (data.client_type === 'confidential' && data.token_endpoint_auth_method === 'client_secret_basic' && data.jwks_uri) {
    return false;
  }
  return true;
}, {
  message: 'Invalid OAuth configuration: public clients must use "none" auth method, confidential clients with private_key_jwt must provide jwks_uri'
});

// Webhooks configuration schema
export const AppWebhooksSchema = z.object({
  endpoints: z.array(z.object({
    url: z.string().url('Invalid webhook URL'),
    events: z.array(z.string()).min(1, 'At least one webhook event is required'),
    signature: z.object({
      type: z.enum(['HMAC_SHA256', 'JWS', 'HTTP_SIGNATURE']),
      header: z.string().min(1, 'Webhook header is required')
    }),
    tolerance_seconds: z.number().optional(),
    retries: z.object({ max: z.number(), backoff: z.enum(['exponential', 'fixed']) }).optional()
  })).min(1, 'At least one webhook endpoint is required')
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
  repository_url: z.string().url('Invalid repository URL').optional(),

  // App configuration
  type: z.enum(['embed', 'mfe_remote', 'server_only'], {
    errorMap: () => ({ message: 'App type must be embed, mfe_remote, or server_only' })
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
  
  // MFE configuration
  mfe: z.object({
    remoteName: z.string().min(1),
    module: z.string().min(1), // e.g., "./App"
    integrity: z.string().optional(), // SRI hash
  }).optional(),
});

// Import manifest request schema
export const ImportManifestRequestSchema = z.object({
  url: z.string().url('Invalid manifest URL'),
  publisherId: z.string().min(1, 'Publisher ID is required')
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

const MAX_MANIFEST_BYTES = 1024 * 1024;

// Where a manifest may not be fetched from: this server, private networks, link-local (cloud metadata)
// and other ranges that are not public addresses. An IPv4 address written as IPv6 is refused whatever it is.
const nonPublicAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
] as const) nonPublicAddresses.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 96], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
  nonPublicAddresses.addSubnet(network, prefix, 'ipv6');
}
const mappedAddresses = new BlockList();
mappedAddresses.addSubnet('::ffff:0:0', 96, 'ipv6');
const isPublicAddress = (address: string) => {
  const ipv6 = isIP(address) === 6;
  return !(ipv6 && mappedAddresses.check(address, 'ipv6')) && !nonPublicAddresses.check(address, ipv6 ? 'ipv6' : 'ipv4');
};
const notPublic = () => new Error('Manifest URL must resolve to a public address');

// Given to the connection itself, so the addresses that are checked are the ones it connects to: a name cannot
// answer one thing for a check and another for the request. Every answer is checked, also when one address is asked for.
const publicLookup: LookupFunction = (hostname, options, callback) => lookup(hostname, { all: true }, (error, addresses) => {
  if (error) return callback(error, []);
  if (!addresses.length || !addresses.every(entry => isPublicAddress(entry.address))) return callback(notPublic(), []);
  if (options.all) callback(null, addresses);
  else callback(null, addresses[0].address, addresses[0].family);
});

// Fetch manifest from URL
export async function fetchManifest(url: string): Promise<unknown> {
  if (!validateManifestUrl(url)) {
    throw new Error('Invalid manifest URL format');
  }

  const target = new URL(url);
  // Like the HTTPS rule above, the address rule holds in production; a developer's local server stays usable elsewhere.
  const production = process.env.NODE_ENV === 'production';
  const literal = target.hostname.replace(/^\[|\]$/g, '');
  // A literal address is never looked up, so it is checked here.
  if (production && isIP(literal) && !isPublicAddress(literal)) throw notPublic();

  const body = await new Promise<string>((resolve, reject) => {
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Collab-App-Platform/1.0' },
      signal: AbortSignal.timeout(10000), // 10 seconds for the whole exchange
      agent: false, // a connection of its own, never one another request opened without the address rule
      ...(production && { lookup: publicLookup }),
    }, response => {
      const status = response.statusCode ?? 0;
      // A redirect is an error like any other status: its target would be a second, unchecked destination.
      if (status < 200 || status > 299) {
        request.destroy();
        return reject(new Error(`Failed to fetch manifest: ${status} ${response.statusMessage}`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_MANIFEST_BYTES) request.destroy(new Error('Manifest is larger than 1 MB'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end();
  });

  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Manifest is not valid JSON');
  }
}
