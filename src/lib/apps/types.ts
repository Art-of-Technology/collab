// App Store Platform Types
export type TokenEndpointAuthMethod =
  | "none"
  | "client_secret_basic"
  | "private_key_jwt"

export type AppScope = 
  | 'workspace:read' 
  | 'issues:read' 
  | 'user:read'
  | 'issues:write'
  | 'comments:read'
  | 'comments:write'
  | 'leave:read'
  | 'leave:write';

export interface AppManifestV1 {
  schema: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  repository_url?: string;
  // App configuration
  type: 'embed' | 'mfe_remote' | 'server_only';
  entrypoint_url: string;
  icon_url?: string;
  
  // Publisher information
  publisher: {
    name: string;
    url: string;
    support_email: string;
    privacy_url?: string;
    terms_url?: string;
  };
  
  // OAuth configuration
  oauth?: { 
    client_id?: string; // Optional during submission, generated on approval
    client_type: 'confidential' | 'public';
    token_endpoint_auth_method: TokenEndpointAuthMethod;
    redirect_uris: string[];
    scopes?: AppScope[];
    post_logout_redirect_uris?: string[];
    response_types?: string[]; // defaults to ["code"]
    grant_types?: string[]; // defaults to ["authorization_code", "refresh_token"]
    jwks_uri?: string; // Required for private_key_jwt
  };
  
  // Webhook configuration
  webhooks?: {
    endpoints: Array<{
      url: string;
      events: string[];
      signature: {
        type: "HMAC_SHA256" | "JWS" | "HTTP_SIGNATURE";
        header: string;
      };
      tolerance_seconds?: number;   // default 300
      retries?: { max: number; backoff: "exponential" | "fixed" };
    }>;
  };
  
  // Permissions and scopes
  scopes: AppScope[];
  permissions: {
    org: boolean;
    user: boolean;
  };
  
  // App metadata
  category?: string;
  visibility: 'public' | 'limited' | 'private';
  
  // API compatibility
  versions: {
    min_api: string;
    tested_api: string;
  };
  
  // Security configuration
  csp?: {
    connectSrc?: string[];
    imgSrc?: string[];
    frameAncestors?: string[];
  };
  
  // MFE configuration
  mfe?: {
    remoteName: string;
    module: string; // e.g., "./App"
    integrity?: string; // SRI hash
  };
}

export interface AppRegistration {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  manifestUrl: string;
  publisherId: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'SUSPENDED';
  latestVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppInstallationData {
  id: string;
  appId: string;
  workspaceId: string;
  installedById: string;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'REMOVED';
  scopes: string[];
  settings?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppVersionData {
  id: string;
  appId: string;
  version: string;
  manifest: AppManifestV1;
  createdAt: Date;
}

export interface AppOAuthData {
  id: string;
  appId: string;
  clientId: string;
  redirectUris: string[];
}

// API Response types
export interface AppImportResponse {
  success: boolean;
  app?: AppRegistration;
  version?: AppVersionData;
  credentials?: {
    clientId: string;
    clientSecret: string;
  };
  error?: string;
}

export interface AppListResponse {
  apps: AppRegistration[];
  total: number;
}

export interface AppDetailResponse {
  app: AppRegistration;
  versions: AppVersionData[];
  oauthClient?: AppOAuthData;
  scopes: string[];
  permissions: {
    org: boolean;
    user: boolean;
  };
}

// Error types
export class AppValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'AppValidationError';
  }
}

export class AppNotFoundError extends Error {
  constructor(slug: string) {
    super(`App with slug "${slug}" not found`);
    this.name = 'AppNotFoundError';
  }
}

export class AppInstallationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppInstallationError';
  }
}
