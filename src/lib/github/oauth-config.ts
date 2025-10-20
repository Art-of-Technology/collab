/**
 * GitHub OAuth Configuration
 * This handles GitHub App integration for seamless repository access
 */

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    type: 'User' | 'Organization';
  };
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  type: 'User' | 'Organization';
}

export const GITHUB_OAUTH_CONFIG: GitHubOAuthConfig = {
  clientId: process.env.GITHUB_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  redirectUri: `${process.env.NEXTAUTH_URL}/api/github/oauth/callback`,
  scopes: [
    'repo', // Full repository access
    'read:user', // Read user profile
    'user:email', // Read user email
    'admin:repo_hook', // Manage webhooks
    'read:org', // Read organization membership and repository access
  ],
};

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_OAUTH_BASE = 'https://github.com/login/oauth';

/**
 * Generate GitHub OAuth authorization URL
 */
export function getGitHubAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_OAUTH_CONFIG.clientId,
    redirect_uri: GITHUB_OAUTH_CONFIG.redirectUri,
    scope: GITHUB_OAUTH_CONFIG.scopes.join(' '),
    state: state || crypto.randomUUID(),
  });

  return `${GITHUB_OAUTH_BASE}/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch(`${GITHUB_OAUTH_BASE}/access_token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_OAUTH_CONFIG.clientId,
      client_secret: GITHUB_OAUTH_CONFIG.clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data.access_token;
}

/**
 * Get user's GitHub repositories
 */
export async function getUserRepositories(
  accessToken: string,
  page = 1,
  perPage = 30,
  sort: 'created' | 'updated' | 'pushed' | 'full_name' = 'updated'
): Promise<{ repositories: GitHubRepository[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
    sort,
    direction: 'desc',
    affiliation: 'owner,collaborator,organization_member',
  });

  console.log('Fetching GitHub repositories with params:', params.toString());

  const response = await fetch(`${GITHUB_API_BASE}/user/repos?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    console.error('GitHub API error:', response.status, response.statusText);
    throw new Error('Failed to fetch repositories');
  }

  const repositories = await response.json();
  console.log(`Fetched ${repositories.length} repositories (page ${page}):`, 
    repositories.map((repo: any) => ({ 
      name: repo.full_name, 
      owner: repo.owner.login, 
      private: repo.private,
      permissions: repo.permissions 
    }))
  );

  const linkHeader = response.headers.get('Link');
  const hasMore = linkHeader?.includes('rel="next"') || false;

  return {
    repositories,
    hasMore,
  };
}

/**
 * Get GitHub user profile
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }

  return response.json();
}

/**
 * Create webhook for repository
 */
export async function createRepositoryWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<{ id: number; url: string }> {
  console.log('Creating webhook for repository:', { owner, repo, webhookUrl });

  // First, check if user has admin permissions
  const repoResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!repoResponse.ok) {
    throw new Error(`Cannot access repository ${owner}/${repo}`);
  }

  const repoData = await repoResponse.json();
  console.log('Repository permissions:', repoData.permissions);

  if (!repoData.permissions?.admin) {
    throw new Error(`Admin access required to create webhooks for ${owner}/${repo}`);
  }

  // Check if webhook already exists
  const existingHooksResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (existingHooksResponse.ok) {
    const existingHooks = await existingHooksResponse.json();
    const existingWebhook = existingHooks.find((hook: any) => 
      hook.config?.url === webhookUrl
    );
    
    if (existingWebhook) {
      console.log('Webhook already exists:', existingWebhook.id);
      return {
        id: existingWebhook.id,
        url: existingWebhook.url,
      };
    }
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/hooks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'web',
      active: true,
      events: [
        'push',
        'pull_request',
        'pull_request_review',
        'check_run',
        'check_suite',
        'release',
        'create',
        'delete',
      ],
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret,
        insecure_ssl: '0',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Webhook creation failed:', {
      status: response.status,
      statusText: response.statusText,
      error,
      repository: `${owner}/${repo}`,
      webhookUrl,
    });
    
    // Show detailed error information
    let errorMessage = error.message || `Failed to create webhook: ${response.status} ${response.statusText}`;
    
    if (error.errors && error.errors.length > 0) {
      const validationErrors = error.errors.map((err: any) => err.message || err.code).join(', ');
      errorMessage += `. Validation errors: ${validationErrors}`;
      console.error('Webhook validation errors:', error.errors);
    }
    
    // Special handling for localhost webhook URLs
    if (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')) {
      errorMessage = 'Webhook creation failed: GitHub cannot reach localhost URLs. For local development, use a tunnel service like ngrok, serveo, or localtunnel to expose your local server, then set WEBHOOK_BASE_URL in your .env file.';
    }
    
    throw new Error(errorMessage);
  }

  const webhook = await response.json();
  console.log('Webhook created successfully:', webhook.id);
  return {
    id: webhook.id,
    url: webhook.url,
  };
}

/**
 * Get repository details
 */
export async function getRepositoryDetails(
  accessToken: string,
  owner: string,
  repo: string
): Promise<GitHubRepository> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch repository details');
  }

  return response.json();
}
