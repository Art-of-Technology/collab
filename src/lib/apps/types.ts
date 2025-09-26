// App Store Platform Types

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
    client_id: string; 
    redirect_uris: string[];
    client_secret?: string; // Optional - will be generated if not provided
    scopes?: AppScope[];
  };
  
  // Webhook configuration
  webhooks?: { 
    url: string;
    events: string[];
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
  
  // Legacy fields for backward compatibility
  homepage_url?: string; // Will be mapped to entrypoint_url
  permissions_legacy?: AppScope[]; // Will be mapped to scopes
}

export interface AppRegistration {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  manifestUrl: string;
  publisherId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'SUSPENDED';
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
