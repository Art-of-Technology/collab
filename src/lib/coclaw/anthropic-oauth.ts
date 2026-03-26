/**
 * Anthropic OAuth — Claude Code Subscription Flow
 *
 * Implements the PKCE authorization code flow for Anthropic's Claude Code
 * subscription tokens. This produces `sk-ant-oat01-*` bearer tokens that
 * Coclaw recognises as subscription auth automatically.
 *
 * Flow:
 * 1. Generate PKCE verifier + SHA256 challenge
 * 2. Redirect user to claude.ai/oauth/authorize
 * 3. Anthropic shows a page with a code for the user to copy
 * 4. User pastes "code#state" back into Collab
 * 5. Exchange code for access_token via console.anthropic.com/v1/oauth/token
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants (shared public OAuth client — same as Claude Code CLI)
// ---------------------------------------------------------------------------

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPES = 'org:create_api_key user:profile user:inference';

// ---------------------------------------------------------------------------
// PKCE State
// ---------------------------------------------------------------------------

export interface PkceState {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

// ---------------------------------------------------------------------------
// PKCE Generation
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure PKCE verifier and SHA256 challenge.
 */
export function generatePkceState(): PkceState {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  // For Claude OAuth, state = verifier (reference implementation pattern)
  return { codeVerifier, codeChallenge, state: codeVerifier };
}

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

/**
 * Build the full OAuth authorize URL for the user to visit.
 */
export function buildAuthorizeUrl(pkce: PkceState): string {
  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    state: pkce.state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token Exchange
// ---------------------------------------------------------------------------

/**
 * Exchange the authorization code for an access token.
 *
 * The user's pasted input can be in the format "code#state" or just "code".
 * We split on '#' if present and validate the state matches.
 */
export async function exchangeCodeForToken(
  rawInput: string,
  pkce: PkceState,
): Promise<OAuthTokenResponse> {
  let code: string;
  let returnedState: string | undefined;

  // Parse "code#state" format
  if (rawInput.includes('#')) {
    const parts = rawInput.split('#');
    code = parts[0];
    returnedState = parts.slice(1).join('#');
  } else {
    code = rawInput.trim();
  }

  // Validate state if present
  if (returnedState && returnedState !== pkce.state) {
    throw new Error('OAuth state mismatch — possible CSRF. Please try again.');
  }

  const body: Record<string, string> = {
    code,
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code_verifier: pkce.codeVerifier,
  };

  // If state was returned, include it
  if (returnedState) {
    body.state = returnedState;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Token exchange response missing access_token');
  }

  return data as OAuthTokenResponse;
}
