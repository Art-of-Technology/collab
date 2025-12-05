# OAuth 2.0 Endpoints for Third-Party Apps

This document describes the OAuth 2.0 endpoints that enable third-party applications to receive access tokens for interacting with the Collab platform.

## Overview

The Collab platform acts as an OAuth 2.0 authorization server, supporting multiple client authentication methods and security features. Third-party applications can:

1. **Authorize users** through the authorization endpoint with PKCE support
2. **Exchange authorization codes** for access tokens via the token endpoint
3. **Refresh expired tokens** using refresh tokens
4. **Authenticate** using multiple methods: client secrets, JWT assertions, or no authentication (public clients)
5. **Introspect tokens** to validate their status
6. **Revoke tokens** when they are no longer needed

## Client Authentication Methods

The platform supports three OAuth 2.0 client authentication methods:

### 1. Public Clients (`none` authentication)
- **Client Type**: `public`
- **Authentication**: No client secret required
- **Security**: PKCE (Proof Key for Code Exchange) is **mandatory**
- **Use Case**: Single-page applications, mobile apps, or any client that cannot securely store secrets

### 2. Confidential Clients with Client Secret (`client_secret_basic`)
- **Client Type**: `confidential`
- **Authentication**: HTTP Basic Authentication with client ID and secret
- **Security**: Client secret must be stored securely
- **Use Case**: Server-side applications that can securely store secrets

### 3. Confidential Clients with JWT Assertion (`private_key_jwt`)
- **Client Type**: `confidential`
- **Authentication**: JWT signed with client's private key
- **Security**: Requires JWKS endpoint with public keys
- **Use Case**: High-security applications with existing PKI infrastructure

## Endpoints

### 1. Authorization Endpoint

**URL:** `GET /api/oauth/authorize`

Initiates the OAuth authorization flow for third-party applications.

**Parameters:**
- `client_id` (required): Your app's client ID
- `redirect_uri` (required): Callback URL for your app
- `response_type` (required): Must be `code`
- `scope` (optional): Space-separated list of requested scopes (default: `read`)
- `state` (optional): CSRF protection token
- `workspace_id` (optional): Specific workspace to authorize for
- `code_challenge` (required for public clients): PKCE code challenge
- `code_challenge_method` (required for public clients): Must be `S256`

**Example:**
```
GET /api/oauth/authorize?client_id=your_client_id&redirect_uri=https://yourapp.com/callback&response_type=code&scope=read%20write&state=random_string
```

**Response:**
- Redirects to login if user not authenticated
- Shows consent screen (if implemented)
- Redirects to `redirect_uri` with authorization code or error

### 2. Token Endpoint

**URL:** `POST /api/oauth/token`

Exchanges authorization codes for access tokens or refreshes expired tokens.

**Content-Type:** `application/x-www-form-urlencoded`

#### Authorization Code Grant

**Parameters:**
- `grant_type`: `authorization_code`
- `client_id`: Your app's client ID (can be in Authorization header for Basic auth)
- `client_assertion_type`: `urn:ietf:params:oauth:client-assertion-type:jwt-bearer` (for JWT authentication)
- `client_assertion`: JWT assertion (for confidential clients using `private_key_jwt`)
- `code`: The authorization code received from the authorization endpoint
- `redirect_uri`: Must match the redirect URI used in the authorization request
- `code_verifier`: PKCE code verifier (required for public clients)

**Examples:**

**Public Client (PKCE):**
```bash
curl -X POST /api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=your_client_id" \
  -d "code=collab_ac_xyz_abc123" \
  -d "redirect_uri=https://yourapp.com/callback" \
  -d "code_verifier=your_code_verifier"
```

**Confidential Client (Basic Auth):**
```bash
curl -X POST /api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'client_id:client_secret' | base64)" \
  -d "grant_type=authorization_code" \
  -d "code=collab_ac_xyz_abc123" \
  -d "redirect_uri=https://yourapp.com/callback"
```

**Confidential Client (JWT Assertion):**
```bash
curl -X POST /api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=your_client_id" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  -d "client_assertion=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d "code=collab_ac_xyz_abc123" \
  -d "redirect_uri=https://yourapp.com/callback"
```

**Success Response:**
```json
{
  "access_token": "collab_at_xyz_abc123",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "collab_rt_xyz_def456",
  "scope": "read write"
}
```

#### Refresh Token Grant

**Parameters:**
- `grant_type`: `refresh_token`
- `client_id`: Your app's client ID (can be in Authorization header for Basic auth)
- `client_assertion_type`: `urn:ietf:params:oauth:client-assertion-type:jwt-bearer` (for JWT authentication)
- `client_assertion`: JWT assertion (for confidential clients using `private_key_jwt`)
- `refresh_token`: The refresh token

**Examples:**

**Public Client:**
```bash
curl -X POST /api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "client_id=your_client_id" \
  -d "refresh_token=collab_rt_xyz_def456"
```

**Confidential Client (Basic Auth):**
```bash
curl -X POST /api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'client_id:client_secret' | base64)" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=collab_rt_xyz_def456"
```

**Confidential Client (JWT Assertion):**
```bash
curl -X POST /api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "client_id=your_client_id" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  -d "client_assertion=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d "refresh_token=collab_rt_xyz_def456"
```

### 3. Token Introspection Endpoint

**URL:** `POST /api/oauth/introspect`

Validates access tokens and returns their metadata (RFC 7662).

**Content-Type:** `application/x-www-form-urlencoded`

**Parameters:**
- `token` (required): The token to introspect
- `token_type_hint` (optional): `access_token` or `refresh_token`
- `client_id` (optional): Your app's client ID (if provided, client authentication is required)
- `client_assertion_type` (optional): `urn:ietf:params:oauth:client-assertion-type:jwt-bearer` (for JWT authentication)
- `client_assertion` (optional): JWT assertion (for confidential clients using `private_key_jwt`)

**Examples:**

**Without Client Authentication:**
```bash
curl -X POST /api/oauth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=collab_at_xyz_abc123" \
  -d "token_type_hint=access_token"
```

**Public Client:**
```bash
curl -X POST /api/oauth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=collab_at_xyz_abc123" \
  -d "token_type_hint=access_token" \
  -d "client_id=your_client_id"
```

**Confidential Client (Basic Auth):**
```bash
curl -X POST /api/oauth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'client_id:client_secret' | base64)" \
  -d "token=collab_at_xyz_abc123" \
  -d "token_type_hint=access_token"
```

**Confidential Client (JWT Assertion):**
```bash
curl -X POST /api/oauth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=collab_at_xyz_abc123" \
  -d "token_type_hint=access_token" \
  -d "client_id=your_client_id" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  -d "client_assertion=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response (Active Token):**
```json
{
  "active": true,
  "scope": "read write",
  "client_id": "your_client_id",
  "token_type": "Bearer",
  "exp": 1640995200,
  "iat": 1640991600,
  "sub": "user_id",
  "aud": "your_app_slug",
  "workspace_id": "workspace_id",
  "workspace_slug": "workspace_slug"
}
```

**Response (Inactive Token):**
```json
{
  "active": false
}
```

### 4. Token Revocation Endpoint

**URL:** `POST /api/oauth/revoke`

Revokes access tokens or refresh tokens when they are no longer needed (RFC 7009).

**Content-Type:** `application/x-www-form-urlencoded`

**Parameters:**
- `token` (required): The token to revoke (access token or refresh token)
- `token_type_hint` (optional): `access_token` or `refresh_token`
- `client_id` (required): Your app's client ID
- `client_assertion_type` (optional): `urn:ietf:params:oauth:client-assertion-type:jwt-bearer` (for JWT authentication)
- `client_assertion` (optional): JWT assertion (for confidential clients using `private_key_jwt`)

**Examples:**

**Public Client:**
```bash
curl -X POST /api/oauth/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=collab_at_xyz_abc123" \
  -d "token_type_hint=access_token" \
  -d "client_id=your_client_id"
```

**Confidential Client (Basic Auth):**
```bash
curl -X POST /api/oauth/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'client_id:client_secret' | base64)" \
  -d "token=collab_at_xyz_abc123" \
  -d "token_type_hint=access_token"
```

**Confidential Client (JWT Assertion):**
```bash
curl -X POST /api/oauth/revoke \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=collab_at_xyz_abc123" \
  -d "token_type_hint=access_token" \
  -d "client_id=your_client_id" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  -d "client_assertion=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Success Response:**
- HTTP 200 OK (empty body)
- Returns 200 even if token was already invalid (per RFC 7009 security requirements)

**Important Notes:**
- Revoking a refresh token also revokes associated access tokens
- Revoking an access token only affects that specific token
- The endpoint always returns HTTP 200 to prevent information disclosure
- Client authentication is required for security

## Supported Scopes

The platform supports the following OAuth scopes:

### Basic Scopes
- `read` - Read access to basic information
- `write` - Write access to basic information

### Resource-Specific Scopes
- `issues:read` - Read access to issues
- `issues:write` - Create and modify issues
- `posts:read` - Read access to posts
- `posts:write` - Create and modify posts
- `tasks:read` - Read access to tasks
- `tasks:write` - Create and modify tasks
- `comments:read` - Read access to comments
- `comments:write` - Create and modify comments
- `milestones:read` - Read access to milestones
- `milestones:write` - Create and modify milestones

### User & Workspace Scopes
- `user:read` - Read access to user information
- `user:write` - Modify user information
- `profile:read` - Read access to user profiles
- `profile:write` - Modify user profiles
- `workspace:read` - Read access to workspace information
- `workspace:write` - Modify workspace settings
- `leave:read` - Read access to leave requests
- `leave:write` - Create and modify leave requests

**Default Scope:** If no scope is specified, `read` is granted by default.

## JWT Assertion Requirements

For confidential clients using `private_key_jwt` authentication, the following requirements apply:

### JWKS Endpoint Requirements
- Must be accessible via HTTPS
- Must return valid JSON Web Key Set (JWKS)
- Keys must include `kid` (Key ID) and appropriate `alg` (Algorithm)
- Must be publicly accessible (no authentication required)

### Supported Algorithms
- **RSA**: RS256, RS384, RS512 (minimum 2048 bits)
- **ECDSA**: ES256, ES384, ES512 (curves: P-256, P-384, P-521)
- **EdDSA**: EdDSA (curves: Ed25519, Ed448)

### JWT Assertion Format
```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-id-1"
}
{
  "iss": "your_client_id",
  "sub": "your_client_id", 
  "aud": "https://yourcollab.com/api/oauth/token",
  "jti": "unique-jwt-id",
  "exp": 1640995200,
  "iat": 1640991600
}
```

### JWT Assertion Validation Rules
- **Issuer (`iss`)**: Must match client ID
- **Subject (`sub`)**: Must match client ID
- **Audience (`aud`)**: Must be the token endpoint URL
- **JWT ID (`jti`)**: Must be unique (replay protection)
- **Expiration (`exp`)**: Maximum 5 minutes from issued time
- **Issued At (`iat`)**: Must be present and reasonable

### Example JWKS Response
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "key-id-1",
      "alg": "RS256",
      "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
      "e": "AQAB"
    }
  ]
}
```

## PKCE (Proof Key for Code Exchange)

For public clients, PKCE is mandatory to prevent authorization code interception attacks.

### PKCE Flow
1. **Generate Code Verifier**: Random string (43-128 characters, URL-safe)
2. **Generate Code Challenge**: SHA256 hash of verifier, base64url encoded
3. **Authorization Request**: Include `code_challenge` and `code_challenge_method=S256`
4. **Token Request**: Include original `code_verifier`

### Example PKCE Implementation
```javascript
// Generate code verifier
const codeVerifier = base64URLEncode(crypto.getRandomValues(new Uint8Array(32)));

// Generate code challenge
const encoder = new TextEncoder();
const data = encoder.encode(codeVerifier);
const digest = await crypto.subtle.digest('SHA-256', data);
const codeChallenge = base64URLEncode(digest);

// Authorization URL
const authUrl = `https://yourcollab.com/api/oauth/authorize?` +
  `client_id=${clientId}&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `response_type=code&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256&` +
  `state=${state}`;
```

## Security Features

### 1. Secure Token Generation
- Uses cryptographically secure random bytes (32 bytes for access tokens, 48 bytes for refresh tokens)
- Base64url encoding for URL safety
- Timestamped tokens for debugging

### 2. Client Authentication Security
- **Basic Auth**: Constant-time comparison to prevent timing attacks
- **JWT Assertion**: Public key cryptography with replay protection
- **Public Clients**: PKCE mandatory for authorization code protection

### 3. Authorization Code Security
- Short expiration time (10 minutes)
- One-time use only
- Automatic cleanup of used codes
- Redirect URI validation
- PKCE challenge verification for public clients

### 4. Token Encryption
- All tokens stored encrypted in database
- Uses AES-256-GCM encryption
- Separate encryption keys from database access

### 5. Scope Validation
- Requested scopes must be subset of installed app scopes
- Scopes validated at both authorization and token exchange
- Comprehensive scope normalization and validation

### 6. Token Revocation Security
- Client authentication required for revocation
- Revoking refresh token also revokes access token
- Always returns HTTP 200 to prevent token existence disclosure
- Immediate database cleanup of revoked tokens

## Error Handling

All endpoints return standardized OAuth 2.0 error responses:

```json
{
  "error": "invalid_request",
  "error_description": "Missing required parameter: client_id"
}
```

Common error codes:
- `invalid_request`: Missing or malformed parameters
- `invalid_client`: Invalid client credentials
- `invalid_grant`: Invalid authorization code or refresh token
- `unsupported_grant_type`: Unsupported grant type
- `invalid_scope`: Invalid or unauthorized scope
- `access_denied`: User denied authorization
- `server_error`: Internal server error

## Database Schema

The implementation includes the following key models:

### Authorization Code Storage
```prisma
model AppOAuthAuthorizationCode {
  id                     String   @id @default(cuid())
  code                   String   @unique
  clientId               String
  userId                 String
  workspaceId            String
  installationId         String
  redirectUri            String
  scope                  String
  state                  String?
  code_challenge         String?  // PKCE code challenge
  code_challenge_method  String?  // PKCE challenge method (S256)
  used                   Boolean  @default(false)
  usedAt                 DateTime?
  expiresAt              DateTime
  createdAt              DateTime @default(now())
  
  oauthClient    AppOAuthClient   @relation(fields: [clientId], references: [clientId], onDelete: Cascade)
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace      Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  installation   AppInstallation  @relation(fields: [installationId], references: [id], onDelete: Cascade)
}
```

### OAuth Client Configuration
```prisma
model AppOAuthClient {
  id                        String   @id @default(cuid())
  clientId                  String   @unique
  clientSecret              String?  // Encrypted, only for confidential clients
  clientType                String   // "public" or "confidential"
  tokenEndpointAuthMethod   String?  // "none", "client_secret_basic", "private_key_jwt"
  jwksUri                   String?  // For private_key_jwt authentication
  redirectUris              String[] // Allowed redirect URIs
  postLogoutRedirectUris    String[] // Post-logout redirect URIs
  responseTypes             String[] // Supported response types
  grantTypes                String[] // Supported grant types
  appId                     String
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  
  app                       App                           @relation(fields: [appId], references: [id], onDelete: Cascade)
  authorizationCodes        AppOAuthAuthorizationCode[]
}
```

### Token Storage
```prisma
model AppInstallation {
  id              String    @id @default(cuid())
  appId           String
  workspaceId     String
  userId          String
  status          String    // "PENDING", "ACTIVE", "SUSPENDED"
  scopes          String[]  // Granted OAuth scopes
  accessToken     String?   // Encrypted access token
  refreshToken    String?   // Encrypted refresh token
  tokenExpiresAt  DateTime? // Access token expiration
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  app             App                           @relation(fields: [appId], references: [id], onDelete: Cascade)
  workspace       Workspace                     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user            User                          @relation(fields: [userId], references: [id], onDelete: Cascade)
  authorizationCodes AppOAuthAuthorizationCode[]
}
```

## OAuth Flow

The complete OAuth 2.0 authorization flow consists of the following steps:

1. **Authorization Request**: Third-party app redirects user to `/api/oauth/authorize`
2. **User Authentication**: User logs in if not already authenticated
3. **User Consent**: User grants permissions to the app (implicit or explicit)
4. **Authorization Code**: Platform redirects back to app with temporary authorization code
5. **Token Exchange**: App exchanges authorization code for access/refresh tokens via `/api/oauth/token`
6. **API Access**: App uses access token to make authenticated API requests
7. **Token Refresh**: App refreshes expired tokens using refresh token (as needed)
8. **Token Revocation**: App revokes tokens when no longer needed via `/api/oauth/revoke`

## Usage Examples

### Public Client (SPA/Mobile App) with PKCE

```javascript
// 1. Generate PKCE parameters
function base64URLEncode(str) {
  return btoa(String.fromCharCode.apply(null, str))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const codeVerifier = base64URLEncode(crypto.getRandomValues(new Uint8Array(32)));
const encoder = new TextEncoder();
const data = encoder.encode(codeVerifier);
const digest = await crypto.subtle.digest('SHA-256', data);
const codeChallenge = base64URLEncode(new Uint8Array(digest));

// 2. Redirect to authorization endpoint
const authUrl = `https://yourcollab.com/api/oauth/authorize?` +
  `client_id=${clientId}&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `response_type=code&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256&` +
  `scope=read%20write&` +
  `state=${state}`;
window.location.href = authUrl;

// 3. Exchange authorization code for tokens
const code = new URLSearchParams(window.location.search).get('code');
const response = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  })
});
const tokens = await response.json();

// 4. Refresh tokens (no client secret needed)
const refreshResponse = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: tokens.refresh_token
  })
});
```

### Confidential Client with Client Secret

```javascript
// 1. Redirect to authorization endpoint
const authUrl = `https://yourcollab.com/api/oauth/authorize?` +
  `client_id=${clientId}&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `response_type=code&` +
  `scope=read%20write&` +
  `state=${state}`;
window.location.href = authUrl;

// 2. Exchange authorization code for tokens (server-side)
const code = new URLSearchParams(window.location.search).get('code');
const response = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri
  })
});
const tokens = await response.json();

// 3. Refresh tokens
const refreshResponse = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
  })
});
```

### Confidential Client with JWT Assertion

```javascript
// 1. Create JWT assertion (server-side with private key)
const jwt = require('jsonwebtoken');
const privateKey = fs.readFileSync('private-key.pem');

const assertion = jwt.sign({
  iss: clientId,
  sub: clientId,
  aud: 'https://yourcollab.com/api/oauth/token',
  jti: crypto.randomUUID(),
  exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
  iat: Math.floor(Date.now() / 1000)
}, privateKey, { 
  algorithm: 'RS256',
  keyid: 'key-id-1'
});

// 2. Exchange authorization code for tokens
const response = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
    code: code,
    redirect_uri: redirectUri
  })
});
const tokens = await response.json();

// 3. Refresh tokens (create new assertion)
const refreshAssertion = jwt.sign({
  iss: clientId,
  sub: clientId,
  aud: 'https://yourcollab.com/api/oauth/token',
  jti: crypto.randomUUID(),
  exp: Math.floor(Date.now() / 1000) + 300,
  iat: Math.floor(Date.now() / 1000)
}, privateKey, { 
  algorithm: 'RS256',
  keyid: 'key-id-1'
});

const refreshResponse = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: refreshAssertion,
    refresh_token: tokens.refresh_token
  })
});
```

### Using Access Tokens

```javascript
// Make authenticated API requests
const apiResponse = await fetch('/api/some-endpoint', {
  headers: {
    'Authorization': `Bearer ${tokens.access_token}`
  }
});

if (apiResponse.status === 401) {
  // Token expired, refresh it
  // ... refresh logic from above examples
}
```

### Token Revocation

```javascript
// Revoke tokens (authentication method must match client type)

// For public clients
await fetch('/api/oauth/revoke', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    token: tokens.access_token,
    token_type_hint: 'access_token',
    client_id: clientId
  })
});

// For confidential clients with client secret (Basic Auth)
await fetch('/api/oauth/revoke', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
  },
  body: new URLSearchParams({
    token: tokens.refresh_token,
    token_type_hint: 'refresh_token'
  })
});

// For confidential clients with JWT assertion
const revokeAssertion = jwt.sign({
  iss: clientId,
  sub: clientId,
  aud: 'https://yourcollab.com/api/oauth/token',
  jti: crypto.randomUUID(),
  exp: Math.floor(Date.now() / 1000) + 300,
  iat: Math.floor(Date.now() / 1000)
}, privateKey, { 
  algorithm: 'RS256',
  keyid: 'key-id-1'
});

await fetch('/api/oauth/revoke', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    token: tokens.refresh_token,
    token_type_hint: 'refresh_token',
    client_id: clientId,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: revokeAssertion
  })
});
```

### Token Introspection

```javascript
// Introspect tokens (client authentication is optional but recommended)

// Without client authentication
const introspectResponse = await fetch('/api/oauth/introspect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    token: tokens.access_token,
    token_type_hint: 'access_token'
  })
});

// With client authentication (public client)
const introspectResponse = await fetch('/api/oauth/introspect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    token: tokens.access_token,
    token_type_hint: 'access_token',
    client_id: clientId
  })
});

// With client authentication (confidential client - Basic Auth)
const introspectResponse = await fetch('/api/oauth/introspect', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
  },
  body: new URLSearchParams({
    token: tokens.access_token,
    token_type_hint: 'access_token'
  })
});

const tokenInfo = await introspectResponse.json();
if (tokenInfo.active) {
  console.log('Token is valid:', tokenInfo);
} else {
  console.log('Token is invalid or expired');
}
```

## Notes

- Authorization codes expire after 10 minutes
- Access tokens expire after 1 hour (3600 seconds)
- Refresh tokens have longer expiration (configurable)
- All tokens are encrypted at rest
- The system supports multiple concurrent tokens per installation
- Token revocation is immediate and affects database storage
- Revoking a refresh token also revokes associated access tokens
- Proper audit logging is in place for security monitoring
